import SwiftUI

/// Green "Join" button for a video call (Google Meet, Teams, FaceTime, Zoom, …).
struct JoinButton: View {
    let conference: Conference
    var prominent: Bool = false
    @Environment(\.openURL) private var openURL

    var body: some View {
        Button { openURL(conference.url) } label: {
            if prominent {
                Label(String(localized: "Join \(conference.service.name)"), systemImage: conference.service.symbol)
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
            } else {
                Label("Join", systemImage: conference.service.symbol)
                    .font(.caption.weight(.semibold))
                    .labelStyle(.titleAndIcon)
                    .padding(.horizontal, 9)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(conference.service.brandColor))
                    .foregroundStyle(.white)
            }
        }
        .modifier(ProminentStyle(on: prominent, tint: conference.service.brandColor))
        .accessibilityLabel(Text("Join \(conference.service.name)"))
    }

    private struct ProminentStyle: ViewModifier {
        let on: Bool
        let tint: Color
        func body(content: Content) -> some View {
            if on { content.buttonStyle(.borderedProminent).tint(tint) } else { content.buttonStyle(.plain) }
        }
    }
}

/// Shows the Join button from 10 minutes before the start until the end; otherwise a small video badge.
struct JoinIfSoon: View {
    let item: EventItem
    var badgeWhenNotSoon: Bool = true

    var body: some View {
        if let c = item.conference, !item.isDeclined {
            TimelineView(.periodic(from: .now, by: 30)) { ctx in
                if Conference.isJoinable(start: item.start, end: item.end, now: ctx.date) {
                    JoinButton(conference: c)
                } else if badgeWhenNotSoon {
                    ConferenceBadge(service: c.service)
                }
            }
        }
    }
}

struct ConferenceBadge: View {
    let service: ConferenceService
    var body: some View {
        Image(systemName: service.symbol)
            .font(.caption)
            .foregroundStyle(service.brandColor)
            .accessibilityLabel(Text(service.name))
    }
}

/// Section in the event details: join, dial in, copy the link.
struct ConferenceSection: View {
    let conference: Conference
    @Environment(\.openURL) private var openURL

    var body: some View {
        Section {
            JoinButton(conference: conference, prominent: true)
                .listRowInsets(EdgeInsets(top: 8, leading: 12, bottom: 8, trailing: 12))
            if let tel = conference.dialURL, let number = conference.dialIn {
                Button { openURL(tel) } label: {
                    LabeledContent {
                        Text(number.components(separatedBy: ",").first ?? number).foregroundStyle(.secondary)
                    } label: {
                        Label("Dial In", systemImage: "phone.fill")
                    }
                }
            }
            Button {
                Clipboard.copy(conference.url.absoluteString)
            } label: {
                Label("Copy Meeting Link", systemImage: "doc.on.doc")
            }
        } header: {
            Text(conference.service.name)
        } footer: {
            Text(conference.url.absoluteString).lineLimit(1).truncationMode(.middle)
        }
    }
}

enum Clipboard {
    static func copy(_ s: String) {
        #if os(iOS)
        UIPasteboard.general.string = s
        #elseif os(macOS)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(s, forType: .string)
        #endif
    }

    static var string: String? {
        #if os(iOS)
        return UIPasteboard.general.string
        #elseif os(macOS)
        return NSPasteboard.general.string(forType: .string)
        #else
        return nil
        #endif
    }
}

extension Color {
    /// The green of FaceTime / call buttons.
    static let joinGreen = Color(red: 0.20, green: 0.70, blue: 0.33)
}

/// Editor: add a Google Meet, Microsoft Teams or FaceTime call to the event, or remove it.
struct VideoCallEditorSection: View {
    @Binding var draft: LocalEventData
    @ObservedObject private var meetings = MeetingService.shared
    @State private var error: String?
    @State private var working: ConferenceService?

    private var current: Conference? {
        ConferenceDetector.detect(urlString: draft.urlString, location: draft.location, notes: draft.notes)
    }

    var body: some View {
        Section {
            if let c = current {
                HStack(spacing: 10) {
                    Image(systemName: c.service.symbol).foregroundStyle(c.service.brandColor)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(c.service.name)
                        Text(c.url.absoluteString).font(.caption).foregroundStyle(.secondary).lineLimit(1).truncationMode(.middle)
                    }
                    Spacer()
                    Button(role: .destructive) { remove(c) } label: {
                        Image(systemName: "minus.circle.fill").foregroundStyle(.red)
                    }
                    .buttonStyle(.borderless)
                    .accessibilityLabel(Text("Remove Video Call"))
                }
            } else if let w = working {
                HStack(spacing: 10) {
                    ProgressView()
                    Text("Creating \(w.name) meeting…").foregroundStyle(.secondary)
                }
            } else {
                Menu {
                    if meetings.isAvailable(.google) {
                        Button { create(.google) } label: { Label("Google Meet", systemImage: "video") }
                    }
                    if meetings.isAvailable(.microsoft) {
                        Button { create(.microsoft) } label: { Label("Microsoft Teams", systemImage: "video") }
                    }
                    Section("FaceTime") {
                        Button(action: pasteFaceTime) {
                            Label("Paste FaceTime Link", systemImage: "doc.on.clipboard")
                        }
                        ForEach(draft.invitees, id: \.self) { mail in
                            Button { addFaceTime(with: mail) } label: {
                                Label(String(localized: "FaceTime with \(mail)"), systemImage: "video.fill")
                            }
                        }
                    }
                } label: {
                    Label("Add Video Call", systemImage: "video.badge.plus")
                }
            }
        } footer: {
            if current == nil && working == nil {
                Text("For a FaceTime link: in the FaceTime app, tap Create Link, copy it and choose Paste FaceTime Link here.")
            }
        }
        .alert("Video Call", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(error ?? "")
        }
    }

    private func create(_ p: MeetingService.Provider) {
        working = p.service
        Task {
            defer { working = nil }
            do {
                let made = try await meetings.create(p, title: draft.title, start: draft.start, end: draft.end)
                apply(url: made.url, notes: MeetingService.notesBlock(service: p.service, created: made))
            } catch MeetingService.MeetingError.cancelled {
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func pasteFaceTime() {
        guard let s = Clipboard.string?.trimmingCharacters(in: .whitespacesAndNewlines),
              let u = URL(string: s), ConferenceDetector.service(for: u) == .facetime else {
            error = String(localized: "The clipboard does not contain a FaceTime link.")
            return
        }
        apply(url: u, notes: String(localized: "Join with \(ConferenceService.facetime.name): \(u.absoluteString)"))
    }

    private func addFaceTime(with address: String) {
        guard let u = URL(string: "facetime://" + address) else { return }
        apply(url: u, notes: nil)
    }

    /// The link goes into the URL field (unless that holds something else) and, with a line, into the notes,
    /// so invitees on other calendars see it too.
    private func apply(url: URL, notes: String?) {
        let existing = draft.urlString.trimmingCharacters(in: .whitespaces)
        if existing.isEmpty || URL(string: existing).flatMap(ConferenceDetector.service(for:)) != nil {
            draft.urlString = url.absoluteString
        }
        if let notes, !draft.notes.contains(url.absoluteString) {
            draft.notes = draft.notes.isEmpty ? notes : draft.notes + "\n\n" + notes
        }
    }

    private func remove(_ c: Conference) {
        let link = c.url.absoluteString
        if draft.urlString.trimmingCharacters(in: .whitespaces) == link { draft.urlString = "" }
        let kept = draft.notes.components(separatedBy: "\n").filter { line in
            !line.contains(link) && !(c.dialIn.map { d in line.contains(d.components(separatedBy: ",,").last?.dropLast().description ?? "~") } ?? false)
        }
        draft.notes = kept.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
        if draft.location.contains(link) { draft.location = "" }
    }
}

/// Settings › Video Calls: the accounts used to create meetings.
struct VideoCallSettingsView: View {
    @ObservedObject private var meetings = MeetingService.shared
    @State private var error: String?

    var body: some View {
        List {
            Section {
                ForEach(MeetingService.Provider.allCases) { p in
                    if meetings.isAvailable(p) {
                        row(p)
                    }
                }
            } header: {
                Text("Accounts")
            } footer: {
                Text("Weekdot only uses these accounts to create a meeting link when you add a video call to an event. The sign-in stays on this device. Teams meetings need a work or school account.")
            }
            Section {
                LabeledContent("FaceTime") { Text("No account needed").foregroundStyle(.secondary) }
            } footer: {
                Text("Weekdot recognises links to Google Meet, Microsoft Teams, FaceTime, Zoom, Webex, WhatsApp and more in your events, and shows a Join button 10 minutes before the start, in the alert and in the widgets.")
            }
        }
        .navigationTitle("Video Calls")
        .alert("Video Calls", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(error ?? "") }
    }

    @ViewBuilder private func row(_ p: MeetingService.Provider) -> some View {
        if let account = meetings.accounts[p] {
            LabeledContent {
                Button("Sign Out", role: .destructive) { meetings.signOut(p) }
                    .buttonStyle(.borderless)
            } label: {
                VStack(alignment: .leading, spacing: 2) {
                    Text(p.service.name)
                    Text(account).font(.caption).foregroundStyle(.secondary)
                }
            }
        } else {
            LabeledContent {
                Button("Sign In") {
                    Task {
                        do { try await meetings.signIn(p) }
                        catch MeetingService.MeetingError.cancelled {}
                        catch { self.error = error.localizedDescription }
                    }
                }
                .buttonStyle(.borderless)
            } label: {
                Text(p.service.name)
            }
        }
    }
}
