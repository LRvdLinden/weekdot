import SwiftUI
import StoreKit

/// When Weekdot may ask for an App Store rating (per device, stored in UserDefaults – not synced):
/// - the first time 4 hours after Weekdot was first used on this device,
/// - after that at most once a week,
/// - only at a quiet moment: a few seconds after opening, after the welcome screen and splash,
///   with nothing being edited or shown in a sheet, and only when there is at least one event.
/// Apple also limits the dialog itself (at most 3 times a year), so a request may show nothing.
enum ReviewPrompter {
    private static let firstUseKey = "review.firstUse"
    private static let lastPromptKey = "review.lastPrompt"
    static let firstDelay: TimeInterval = 4 * 3600
    static let interval: TimeInterval = 7 * 24 * 3600

    static func markFirstUse() {
        let d = UserDefaults.standard
        if d.object(forKey: firstUseKey) == nil { d.set(Date(), forKey: firstUseKey) }
    }

    static func isDue(now: Date = Date()) -> Bool {
        let d = UserDefaults.standard
        guard let first = d.object(forKey: firstUseKey) as? Date,
              now.timeIntervalSince(first) >= firstDelay else { return false }
        if let last = d.object(forKey: lastPromptKey) as? Date, now.timeIntervalSince(last) < interval { return false }
        return true
    }

    static func didPrompt(now: Date = Date()) {
        UserDefaults.standard.set(now, forKey: lastPromptKey)
    }
}

private struct ReviewPromptModifier: ViewModifier {
    @Environment(\.requestReview) private var requestReview
    @Environment(\.scenePhase) private var scenePhase
    @EnvironmentObject private var state: AppState
    @EnvironmentObject private var store: CalendarStore

    /// Seconds after opening; the splash takes about 2 seconds.
    private let settleDelay: UInt64 = 5_000_000_000

    func body(content: Content) -> some View {
        content.task(id: scenePhase) {
            guard scenePhase == .active, !ScreenshotMode.isActive else { return }
            ReviewPrompter.markFirstUse()
            guard ReviewPrompter.isDue() else { return }
            try? await Task.sleep(nanoseconds: settleDelay)
            guard !Task.isCancelled, scenePhase == .active, isQuiet, hasEvents, ReviewPrompter.isDue() else { return }
            ReviewPrompter.didPrompt()
            requestReview()
        }
    }

    private var isQuiet: Bool {
        state.editor == nil && state.detail == nil && state.sheet == nil
            && state.pendingChange == nil && !state.isDraggingEvent
    }

    private var hasEvents: Bool {
        let now = Date()
        return !store.events(from: now.addingTimeInterval(-30 * 86400), to: now.addingTimeInterval(60 * 86400)).isEmpty
    }
}

extension View {
    /// Asks for an App Store rating at a quiet moment (see ReviewPrompter).
    func reviewPrompt() -> some View { modifier(ReviewPromptModifier()) }
}
