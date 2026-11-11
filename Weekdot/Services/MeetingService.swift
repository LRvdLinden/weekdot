import Foundation
import AuthenticationServices
import CryptoKit
#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

/// Creates Google Meet and Microsoft Teams meetings for an event (like Fantastical's conference switches).
///
/// Sign-in is OAuth 2.0 with PKCE in the system browser sheet; Weekdot has no client secret and no server.
/// The client IDs come from `MeetingClients.plist` in the app bundle (template: `Config/MeetingClients.example.plist`):
/// - `GoogleClientID`: a Google Cloud OAuth client of type iOS (bundle id nl.lrvdlinden.weekdot), with the
///   Google Meet REST API enabled. Scope `meetings.space.created`: Weekdot can only see meetings it created itself.
/// - `MicrosoftClientID`: an app registration (Microsoft Entra) with a "Mobile and desktop" redirect URI
///   `msauth.nl.lrvdlinden.weekdot://auth` and the delegated permission `OnlineMeetings.ReadWrite`.
///   Microsoft only allows this for work or school accounts, not for personal (outlook.com) accounts.
/// Tokens stay in the device keychain (not synced). Nothing else is sent to Google or Microsoft.
@MainActor
final class MeetingService: NSObject, ObservableObject {
    static let shared = MeetingService()

    enum Provider: String, CaseIterable, Identifiable {
        case google, microsoft
        var id: String { rawValue }
        var service: ConferenceService { self == .google ? .meet : .teams }
        var accountName: String { self == .google ? "Google" : "Microsoft" }
    }

    struct Created {
        let url: URL
        let dialIn: String?
    }

    enum MeetingError: LocalizedError {
        case notConfigured, cancelled, bad, personalAccount, accountNotAllowed, missingPermission(String), http(Int, String?)
        var errorDescription: String? {
            switch self {
            case .notConfigured: return String(localized: "This service is not available in this version of Weekdot.")
            case .cancelled: return nil
            case .bad: return String(localized: "The meeting could not be created. Try again.")
            case .missingPermission(let account):
                return String(localized: "Weekdot did not get permission to create meetings with \(account). Try again and tick the box for creating meetings when you sign in.")
            case .accountNotAllowed:
                return String(localized: "This account can't be used for Teams meetings in Weekdot yet. Use a work or school account, or try again later.")
            case .personalAccount:
                return String(localized: "Microsoft only allows Teams meetings from apps for work or school accounts.")
            case .http(let code, let msg): return msg.map { "\($0) (\(code))" } ?? String(localized: "The meeting could not be created. Try again.") + " (\(code))"
            }
        }
    }

    /// Signed-in account per provider (e-mail address), for the settings screen.
    @Published private(set) var accounts: [Provider: String] = [:]
    @Published var isBusy = false

    private struct Tokens: Codable {
        var access: String
        var refresh: String?
        var expires: Date
        var account: String?
        /// Scopes the user actually granted (Google lets people untick a permission on the consent screen).
        var scope: String?
    }

    /// The permission each provider needs to create meetings.
    private static func requiredScope(_ p: Provider) -> String {
        p == .google ? "https://www.googleapis.com/auth/meetings.space.created" : "OnlineMeetings.ReadWrite"
    }

    private struct Config {
        let clientID: String
        let authorize: String
        let token: String
        let scope: String
        let redirect: String
        var scheme: String { String(redirect.prefix { $0 != ":" }) }
    }

    private var authSession: ASWebAuthenticationSession?

    private override init() {
        super.init()
        for p in Provider.allCases {
            if let t = tokens(p) { accounts[p] = t.account ?? p.accountName }
        }
    }

    // MARK: Configuration

    private static let plist: [String: String] = {
        guard let url = Bundle.main.url(forResource: "MeetingClients", withExtension: "plist"),
              let dict = NSDictionary(contentsOf: url) as? [String: Any] else { return [:] }
        return dict.compactMapValues { v in
            guard let s = v as? String, !s.isEmpty, !s.hasPrefix("YOUR_") else { return nil }
            return s
        }
    }()

    private static func config(_ p: Provider) -> Config? {
        switch p {
        case .google:
            guard let id = plist["GoogleClientID"] else { return nil }
            // iOS-type Google clients use the reversed client id as redirect scheme
            let reversed = id.components(separatedBy: ".").reversed().joined(separator: ".")
            return Config(clientID: id,
                          authorize: "https://accounts.google.com/o/oauth2/v2/auth",
                          token: "https://oauth2.googleapis.com/token",
                          scope: "openid email https://www.googleapis.com/auth/meetings.space.created",
                          redirect: reversed + ":/oauth2redirect")
        case .microsoft:
            guard let id = plist["MicrosoftClientID"] else { return nil }
            return Config(clientID: id,
                          authorize: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
                          token: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
                          scope: "openid profile email offline_access https://graph.microsoft.com/OnlineMeetings.ReadWrite",
                          redirect: "msauth.nl.lrvdlinden.weekdot://auth")
        }
    }

    func isAvailable(_ p: Provider) -> Bool { Self.config(p) != nil }
    func isSignedIn(_ p: Provider) -> Bool { accounts[p] != nil }

    // MARK: Create

    /// Creates a meeting; signs in first when needed.
    func create(_ p: Provider, title: String, start: Date, end: Date) async throws -> Created {
        isBusy = true
        defer { isBusy = false }
        do {
            return try await createOnce(p, title: title, start: start, end: end)
        } catch MeetingError.http(let code, _) where p == .google && (code == 401 || code == 403) {
            // token without the Meet permission (or revoked): sign in again, asking for consent, and retry once
            signOut(p)
            try await signIn(p)
            return try await createOnce(p, title: title, start: start, end: end)
        }
    }

    private func createOnce(_ p: Provider, title: String, start: Date, end: Date) async throws -> Created {
        let token = try await validToken(p)
        switch p {
        case .google:
            // A Meet space on its own, so the link works in any calendar (Apple, Google, Outlook or Weekdot).
            let data = try await request("POST", "https://meet.googleapis.com/v2/spaces", token: token, json: [:])
            guard let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let uri = obj["meetingUri"] as? String, let url = URL(string: uri) else { throw MeetingError.bad }
            return Created(url: url, dialIn: nil)
        case .microsoft:
            let f = ISO8601DateFormatter()
            let body: [String: Any] = ["subject": title.isEmpty ? String(localized: "New Event") : title,
                                       "startDateTime": f.string(from: start),
                                       "endDateTime": f.string(from: max(end, start.addingTimeInterval(15 * 60)))]
            let data: Data
            do {
                data = try await request("POST", "https://graph.microsoft.com/v1.0/me/onlineMeetings", token: token, json: body)
            } catch MeetingError.http(let code, _) where code == 400 || code == 403 || code == 404 {
                throw MeetingError.personalAccount
            }
            guard let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let link = (obj["joinWebUrl"] as? String) ?? (obj["joinUrl"] as? String),
                  let url = URL(string: link) else { throw MeetingError.bad }
            var dial: String?
            if let audio = obj["audioConferencing"] as? [String: Any],
               let number = (audio["tollNumber"] as? String) ?? (audio["tollFreeNumber"] as? String),
               let pin = audio["conferenceId"] as? String {
                dial = number.filter { $0.isNumber || $0 == "+" } + ",," + pin.filter(\.isNumber) + "#"
            }
            return Created(url: url, dialIn: dial)
        }
    }

    /// Text that goes into the event notes (sent along with invitations), like Teams and Meet do themselves.
    static func notesBlock(service: ConferenceService, created: Created) -> String {
        var lines = [String(localized: "Join with \(service.name): \(created.url.absoluteString)")]
        if let d = created.dialIn {
            let parts = d.components(separatedBy: ",,")
            if parts.count == 2 {
                lines.append(String(localized: "Dial in: \(parts[0]), conference ID \(parts[1])"))
            }
        }
        return lines.joined(separator: "\n")
    }

    // MARK: Accounts

    func signIn(_ p: Provider) async throws {
        guard let c = Self.config(p) else { throw MeetingError.notConfigured }
        let verifier = Self.randomString(64)
        let challenge = Data(SHA256.hash(data: Data(verifier.utf8))).base64URL
        let state = Self.randomString(24)
        var comps = URLComponents(string: c.authorize)!
        var items: [URLQueryItem] = [
            .init(name: "client_id", value: c.clientID),
            .init(name: "redirect_uri", value: c.redirect),
            .init(name: "response_type", value: "code"),
            .init(name: "scope", value: c.scope),
            .init(name: "state", value: state),
            .init(name: "code_challenge", value: challenge),
            .init(name: "code_challenge_method", value: "S256"),
        ]
        if p == .google { items.append(.init(name: "access_type", value: "offline")) }
        items.append(.init(name: "prompt", value: p == .google ? "consent select_account" : "select_account"))
        comps.queryItems = items
        let callback = try await authenticate(url: comps.url!, scheme: c.scheme)
        let q = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
        if q.first(where: { $0.name == "error" }) != nil {
            let desc = q.first(where: { $0.name == "error_description" })?.value
            throw Self.signInError(desc, account: p.accountName)
        }
        guard q.first(where: { $0.name == "state" })?.value == state,
              let code = q.first(where: { $0.name == "code" })?.value else { throw MeetingError.bad }
        var t = try await tokenRequest(c, ["grant_type": "authorization_code", "code": code,
                                           "redirect_uri": c.redirect, "code_verifier": verifier])
        if t.account == nil { t.account = p.accountName }
        if let granted = t.scope, !granted.contains(Self.requiredScope(p)) {
            signOut(p)
            throw MeetingError.missingPermission(p.accountName)
        }
        save(t, for: p)
    }

    func signOut(_ p: Provider) {
        Keychain.delete(key(p))
        accounts[p] = nil
    }

    // MARK: Tokens

    private func key(_ p: Provider) -> String { "meeting." + p.rawValue }

    private func tokens(_ p: Provider) -> Tokens? {
        Keychain.read(key(p)).flatMap { try? JSONDecoder().decode(Tokens.self, from: $0) }
    }

    private func save(_ t: Tokens, for p: Provider) {
        if let d = try? JSONEncoder().encode(t) { Keychain.write(d, for: key(p)) }
        accounts[p] = t.account ?? p.accountName
    }

    private func validToken(_ p: Provider) async throws -> String {
        guard let c = Self.config(p) else { throw MeetingError.notConfigured }
        if var t = tokens(p) {
            if t.expires > Date().addingTimeInterval(60) { return t.access }
            if let r = t.refresh,
               let fresh = try? await tokenRequest(c, ["grant_type": "refresh_token", "refresh_token": r]) {
                t.access = fresh.access
                t.expires = fresh.expires
                if let nr = fresh.refresh { t.refresh = nr }
                save(t, for: p)
                return t.access
            }
        }
        try await signIn(p)
        guard let t = tokens(p) else { throw MeetingError.bad }
        return t.access
    }

    private func tokenRequest(_ c: Config, _ params: [String: String]) async throws -> Tokens {
        var all = params
        all["client_id"] = c.clientID
        if c.authorize.contains("microsoft") { all["scope"] = c.scope }
        var req = URLRequest(url: URL(string: c.token)!)
        req.httpMethod = "POST"
        req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        req.httpBody = all.map { "\($0.key)=\(Self.formEncode($0.value))" }.joined(separator: "&").data(using: .utf8)
        let (data, resp) = try await URLSession.shared.data(for: req)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        guard (200..<300).contains(code), let access = obj["access_token"] as? String else {
            throw Self.signInError((obj["error_description"] as? String) ?? (obj["error"] as? String), code: code)
        }
        let expiresIn = (obj["expires_in"] as? Double) ?? Double(obj["expires_in"] as? String ?? "") ?? 3600
        return Tokens(access: access, refresh: obj["refresh_token"] as? String,
                      expires: Date().addingTimeInterval(expiresIn),
                      account: (obj["id_token"] as? String).flatMap(Self.email(fromIDToken:)),
                      scope: obj["scope"] as? String)
    }

    private func request(_ method: String, _ url: String, token: String, json: [String: Any]) async throws -> Data {
        var req = URLRequest(url: URL(string: url)!)
        req.httpMethod = method
        req.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: json)
        let (data, resp) = try await URLSession.shared.data(for: req)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else {
            let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            let msg = ((obj?["error"] as? [String: Any])?["message"] as? String)
            throw MeetingError.http(code, msg)
        }
        return data
    }

    // MARK: Helpers

    /// Turns an OAuth error ("AADSTS9002346: Application … is configured for use by Microsoft Account users only. …
    /// Trace ID: …") into a readable message without codes, trace IDs and timestamps.
    private static func signInError(_ raw: String?, code: Int = 400, account: String = "Microsoft") -> MeetingError {
        guard var text = raw, !text.isEmpty else { return .http(code, nil) }
        text = text.replacingOccurrences(of: "+", with: " ")
        text = text.removingPercentEncoding ?? text
        // Microsoft: account type the app registration does not accept
        if ["AADSTS9002346", "AADSTS50020", "AADSTS50194", "AADSTS500200", "AADSTS9002331"].contains(where: { text.contains($0) }) {
            return .accountNotAllowed
        }
        if text.contains("AADSTS65001") || text.contains("access_denied") {
            return .missingPermission(account)
        }
        if let r = text.range(of: " Trace ID") { text = String(text[..<r.lowerBound]) }
        if let r = text.range(of: #"^AADSTS\d+:\s*"#, options: .regularExpression) { text.removeSubrange(r) }
        return .http(code, text.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    private static func email(fromIDToken jwt: String) -> String? {
        let parts = jwt.components(separatedBy: ".")
        guard parts.count > 1 else { return nil }
        var b64 = parts[1].replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while b64.count % 4 != 0 { b64 += "=" }
        guard let data = Data(base64Encoded: b64),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return (obj["email"] as? String) ?? (obj["preferred_username"] as? String)
    }

    private static func randomString(_ n: Int) -> String {
        let chars = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
        var g = SystemRandomNumberGenerator()
        return String((0..<n).map { _ in chars[Int(g.next() % UInt64(chars.count))] })
    }

    private static func formEncode(_ s: String) -> String {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        return s.addingPercentEncoding(withAllowedCharacters: allowed) ?? s
    }

    private func authenticate(url: URL, scheme: String) async throws -> URL {
        try await withCheckedThrowingContinuation { cont in
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { url, error in
                if let url { cont.resume(returning: url) }
                else if let e = error as? ASWebAuthenticationSessionError, e.code == .canceledLogin {
                    cont.resume(throwing: MeetingError.cancelled)
                } else { cont.resume(throwing: error ?? MeetingError.bad) }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            authSession = session
            session.start()
        }
    }
}

extension MeetingService: ASWebAuthenticationPresentationContextProviding {
    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            #if os(iOS)
            let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            return scenes.flatMap(\.windows).first(where: \.isKeyWindow) ?? scenes.first?.windows.first ?? ASPresentationAnchor()
            #elseif os(macOS)
            return NSApplication.shared.keyWindow ?? NSApplication.shared.windows.first ?? ASPresentationAnchor()
            #endif
        }
    }
}

private extension Data {
    var base64URL: String {
        base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
