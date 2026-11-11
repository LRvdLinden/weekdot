import Foundation

/// Video-call services Weekdot recognises in an event (URL, location or notes), like Fantastical's quick join.
enum ConferenceService: String, Codable, CaseIterable {
    case facetime, teams, meet, zoom, webex, whatsapp, gotomeeting, jitsi, whereby, slack, chime, ringcentral,
         bluejeans, lifesize, dialpad, gather, discord, signal, telegram, generic

    /// Shown on the Join button and in lists. Brand names are not translated.
    var name: String {
        switch self {
        case .facetime: return "FaceTime"
        case .teams: return "Microsoft Teams"
        case .meet: return "Google Meet"
        case .zoom: return "Zoom"
        case .webex: return "Webex"
        case .whatsapp: return "WhatsApp"
        case .gotomeeting: return "GoTo Meeting"
        case .jitsi: return "Jitsi Meet"
        case .whereby: return "Whereby"
        case .slack: return "Slack Huddle"
        case .chime: return "Amazon Chime"
        case .ringcentral: return "RingCentral"
        case .bluejeans: return "BlueJeans"
        case .lifesize: return "Lifesize"
        case .dialpad: return "Dialpad"
        case .gather: return "Gather"
        case .discord: return "Discord"
        case .signal: return "Signal"
        case .telegram: return "Telegram"
        case .generic: return String(localized: "Video Call")
        }
    }

    /// The service's own brand colour (hex), used for Join buttons and badges.
    /// Slightly deepened where the official colour is too light for white text.
    var brandHex: String {
        switch self {
        case .facetime: return "#30B94D"
        case .teams: return "#5B5FC7"
        case .meet: return "#00832D"
        case .zoom: return "#0B5CFF"
        case .webex: return "#0A7FC2"
        case .whatsapp: return "#128C7E"
        case .gotomeeting: return "#E5751F"
        case .jitsi: return "#1D76BA"
        case .whereby: return "#5B3FD9"
        case .slack: return "#4A154B"
        case .chime: return "#0073BB"
        case .ringcentral: return "#F57C00"
        case .bluejeans: return "#0071CE"
        case .lifesize: return "#0077C8"
        case .dialpad: return "#7C52FF"
        case .gather: return "#5B5BD6"
        case .discord: return "#5865F2"
        case .signal: return "#3A76F0"
        case .telegram: return "#1E8BC3"
        case .generic: return "#34B553"
        }
    }

    /// SF Symbol (no third-party logos).
    var symbol: String {
        switch self {
        case .facetime: return "video.fill"
        case .whatsapp, .signal, .telegram: return "phone.bubble.fill"
        default: return "video.fill"
        }
    }

    /// Patterns per service, matched against the host and path (lowercased, without scheme).
    fileprivate static let patterns: [(ConferenceService, [String])] = [
        (.facetime, ["facetime.apple.com/join"]),
        (.teams, ["teams.microsoft.com/l/meetup-join", "teams.live.com/meet", "teams.microsoft.com/meet", "teams.live.com/l/meetup-join"]),
        (.meet, ["meet.google.com/"]),
        (.zoom, ["zoom.us/j/", "zoom.us/my/", "zoom.us/w/", "zoom.us/s/", "zoomgov.com/j/", "zoom.com/j/"]),
        (.webex, ["webex.com/meet", "webex.com/join", "webex.com/wbxmjs", ".webex.com/"]),
        (.whatsapp, ["call.whatsapp.com/", "chat.whatsapp.com/"]),
        (.gotomeeting, ["meet.goto.com/", "global.gotomeeting.com/join", "gotomeet.me/", "app.gotomeeting.com/"]),
        (.jitsi, ["meet.jit.si/", "8x8.vc/"]),
        (.whereby, ["whereby.com/"]),
        (.slack, ["app.slack.com/huddle", "slack.com/huddle"]),
        (.chime, ["chime.aws/"]),
        (.ringcentral, ["meetings.ringcentral.com/j", "v.ringcentral.com/join"]),
        (.bluejeans, ["bluejeans.com/"]),
        (.lifesize, ["call.lifesizecloud.com/"]),
        (.dialpad, ["meetings.dialpad.com/", "dialpad.com/join"]),
        (.gather, ["app.gather.town/"]),
        (.discord, ["discord.gg/", "discord.com/channels/"]),
        (.signal, ["signal.group/", "signal.link/call"]),
        (.telegram, ["t.me/call/"]),
    ]
}

/// A video call found in an event.
struct Conference: Hashable, Codable {
    var service: ConferenceService
    var url: URL
    /// Dial-in number with PIN, ready for `tel:` (commas pause before the PIN), when the notes contain one.
    var dialIn: String?

    var dialURL: URL? {
        guard let d = dialIn, !d.isEmpty else { return nil }
        return URL(string: "tel:" + d.replacingOccurrences(of: "#", with: "%23"))
    }

    /// The Join button is shown from this long before the start until the end.
    static let joinLead: TimeInterval = 10 * 60

    static func isJoinable(start: Date, end: Date, now: Date = Date()) -> Bool {
        now >= start.addingTimeInterval(-joinLead) && now <= max(end, start.addingTimeInterval(15 * 60))
    }
}

enum ConferenceDetector {
    private static let linkDetector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)

    /// Finds the first known video-call link in the URL field, then location, then notes.
    /// Fast path: texts without a likely host are skipped without running the data detector.
    static func detect(url: URL?, location: String?, notes: String?) -> Conference? {
        if let u = url, let s = service(for: u) { return Conference(service: s, url: u, dialIn: dialIn(in: notes)) }
        for text in [location, notes] {
            guard let text, !text.isEmpty, mightContainLink(text) else { continue }
            if let (s, u) = firstLink(in: text) { return Conference(service: s, url: u, dialIn: dialIn(in: notes)) }
        }
        return nil
    }

    static func detect(urlString: String?, location: String?, notes: String?) -> Conference? {
        detect(url: urlString.flatMap { $0.isEmpty ? nil : URL(string: $0.trimmingCharacters(in: .whitespacesAndNewlines)) },
               location: location, notes: notes)
    }

    static func service(for url: URL) -> ConferenceService? {
        let scheme = url.scheme?.lowercased() ?? ""
        if scheme == "facetime" || scheme == "facetime-audio" { return .facetime }
        if scheme == "msteams" { return .teams }
        if scheme == "zoommtg" || scheme == "zoomus" { return .zoom }
        guard scheme == "https" || scheme == "http" else { return nil }
        let s = ((url.host ?? "") + url.path).lowercased()
        for (service, keys) in ConferenceService.patterns where keys.contains(where: { s.contains($0) }) {
            if service == .meet, url.path.count < 4 { continue }   // meet.google.com itself is not a meeting
            return service
        }
        return nil
    }

    private static func mightContainLink(_ text: String) -> Bool {
        text.range(of: "http", options: .caseInsensitive) != nil
            || text.range(of: "facetime", options: .caseInsensitive) != nil
            || text.range(of: "zoom", options: .caseInsensitive) != nil
            || text.range(of: "meet.", options: .caseInsensitive) != nil
            || text.range(of: "teams", options: .caseInsensitive) != nil
    }

    private static func firstLink(in text: String) -> (ConferenceService, URL)? {
        guard let detector = linkDetector else { return nil }
        let ns = text as NSString
        var found: (ConferenceService, URL)?
        detector.enumerateMatches(in: text, options: [], range: NSRange(location: 0, length: ns.length)) { m, _, stop in
            guard let u = m?.url else { return }
            let fixed = u.scheme == nil ? URL(string: "https://" + u.absoluteString) ?? u : u
            if let s = service(for: fixed) { found = (s, fixed); stop.pointee = true }
        }
        return found
    }

    /// "+31 20 123 4567,,123456789#" style dial-in from notes, only when a conference PIN/ID is next to it.
    static func dialIn(in notes: String?) -> String? {
        guard let notes, !notes.isEmpty else { return nil }
        // one-tap mobile lines, as Zoom/Teams/Meet write them: +31207941375,,86211234567#
        if let r = notes.range(of: #"\+\d[\d ]{6,18}\d,,+[\d*]+#?"#, options: .regularExpression) {
            return String(notes[r]).replacingOccurrences(of: " ", with: "")
        }
        // "Phone: +1 234 567 890 … PIN: 123 456 789#"
        let phonePattern = #"\+\d[\d \-()]{6,20}\d"#
        let pinPattern = #"(?i)(pin|id|code|conference|meeting|vergadering|toegang)[^\d\n]{0,25}([\d ]{4,16}\d)\s*#?"#
        guard let p = notes.range(of: phonePattern, options: .regularExpression),
              let pinRange = notes.range(of: pinPattern, options: .regularExpression) else { return nil }
        let phone = notes[p].filter { $0.isNumber || $0 == "+" }
        let pinText = String(notes[pinRange])
        guard let digits = pinText.range(of: #"[\d ]{4,16}\d"#, options: .regularExpression) else { return nil }
        let pin = pinText[digits].filter(\.isNumber)
        return phone + ",," + pin + "#"
    }
}
