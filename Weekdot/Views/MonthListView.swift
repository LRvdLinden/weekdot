import SwiftUI

/// Month & List: a compact month with coloured dots per day on top, and below it the events
/// from the selected day onwards (like the "month with list" view of classic calendar apps).
/// On wide screens (iPad, Mac) the month sits on the left and the list on the right.
struct MonthListView: View {
    @EnvironmentObject private var synced: SyncedStore
    @EnvironmentObject private var store: CalendarStore
    @EnvironmentObject private var state: AppState

    private var settings: AppSettings { synced.settings }
    private var cal: Calendar { settings.calendar }

    /// Days shown in the list, from the selected day.
    private let listDays = 60

    var body: some View {
        GeometryReader { geo in
            if geo.size.width > 700 {
                HStack(spacing: 0) {
                    MiniMonthGrid(rowHeight: 58)
                        .frame(width: min(440, geo.size.width * 0.45))
                        .frame(maxHeight: .infinity, alignment: .top)
                    Divider()
                    list
                }
            } else {
                VStack(spacing: 0) {
                    MiniMonthGrid(rowHeight: geo.size.height < 600 ? 40 : 46)
                    Divider()
                    list
                }
            }
        }
    }

    private var list: some View {
        let start = cal.startOfDay(for: state.date)
        let _ = store.revision
        let byDay = store.eventsByDay(from: start, days: listDays, calendar: cal)
        let days = byDay.keys.sorted()
        return Group {
            if days.isEmpty {
                ContentUnavailableView("No events", systemImage: "calendar",
                                       description: Text("Nothing planned in the next 60 days."))
            } else {
                ScrollViewReader { proxy in
                    List {
                        ForEach(days, id: \.self) { day in
                            Section {
                                ForEach(byDay[day] ?? []) { item in
                                    MonthListRow(item: item)
                                        .contentShape(Rectangle())
                                        .onTapGesture { state.detail = item }
                                        .contextMenu { EventContextMenu(item: item) }
                                }
                            } header: {
                                HStack(spacing: 6) {
                                    Text(day.formatted(.dateTime.weekday(.wide).day().month(.wide).year()))
                                    if cal.isDateInToday(day) {
                                        Text("Today").foregroundStyle(Color.weekdotRed)
                                    }
                                }
                                .font(.footnote.weight(.semibold))
                                .textCase(.uppercase)
                                .id(day)
                            }
                        }
                    }
                    .listStyle(.plain)
                    .onChange(of: start) { _, _ in
                        if let first = days.first { proxy.scrollTo(first, anchor: .top) }
                    }
                }
            }
        }
    }
}

/// The month part: weekday header, optional week numbers, day numbers with up to four coloured dots.
private struct MiniMonthGrid: View {
    let rowHeight: CGFloat

    @EnvironmentObject private var synced: SyncedStore
    @EnvironmentObject private var store: CalendarStore
    @EnvironmentObject private var state: AppState

    private var settings: AppSettings { synced.settings }
    private var cal: Calendar { settings.calendar }

    var body: some View {
        let grid = cal.monthGrid(for: state.date)
        let _ = store.revision
        let byDay = store.eventsByDay(from: grid.first ?? state.date, days: grid.count, calendar: cal)
        let weeks = stride(from: 0, to: grid.count, by: 7).map { Array(grid[$0..<min($0 + 7, grid.count)]) }
        let numberWidth: CGFloat = settings.showWeekNumbers ? 26 : 0

        VStack(spacing: 0) {
            HStack(spacing: 0) {
                if settings.showWeekNumbers { Color.clear.frame(width: numberWidth, height: 1) }
                ForEach(Array(cal.orderedShortWeekdays().enumerated()), id: \.offset) { _, s in
                    Text(s)
                        .font(.caption2.weight(.semibold))
                        .textCase(.uppercase)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity)
                }
            }
            .padding(.vertical, 6)
            ForEach(Array(weeks.enumerated()), id: \.offset) { _, week in
                HStack(spacing: 0) {
                    if settings.showWeekNumbers, let first = week.first {
                        Button { state.open(day: first, mode: .week) } label: {
                            Text("\(cal.weekNumber(first))")
                                .font(.system(size: 10, weight: .medium))
                                .foregroundStyle(.secondary)
                                .frame(width: numberWidth, height: rowHeight)
                        }
                        .buttonStyle(.plain)
                    }
                    ForEach(week, id: \.self) { day in
                        MiniMonthDay(day: day,
                                     inMonth: cal.isDate(day, equalTo: state.date, toGranularity: .month),
                                     items: byDay[cal.startOfDay(for: day)] ?? [],
                                     height: rowHeight)
                    }
                }
            }
        }
        .padding(.horizontal, 6)
        .padding(.bottom, 4)
    }
}

private struct MiniMonthDay: View {
    let day: Date
    let inMonth: Bool
    let items: [EventItem]
    let height: CGFloat

    @EnvironmentObject private var synced: SyncedStore
    @EnvironmentObject private var store: CalendarStore
    @EnvironmentObject private var state: AppState

    var body: some View {
        let cal = synced.settings.calendar
        let isToday = cal.isDateInToday(day)
        let isSelected = cal.isDate(day, inSameDayAs: state.date)
        let colors = dotColors
        VStack(spacing: 3) {
            Text(day.formatted(.dateTime.day()))
                .font(.system(size: 17, weight: isSelected || isToday ? .semibold : .regular))
                .foregroundStyle(numberColor(isToday: isToday, isSelected: isSelected))
                .frame(width: 32, height: 32)
                .background {
                    if isSelected {
                        Circle().fill(isToday ? Color.weekdotRed : Color.secondary.opacity(0.55))
                    }
                }
            HStack(spacing: 2.5) {
                ForEach(Array(colors.enumerated()), id: \.offset) { _, c in
                    Circle().fill(c).frame(width: 5, height: 5)
                }
            }
            .frame(height: 5)
        }
        .frame(maxWidth: .infinity)
        .frame(height: height)
        .background(synced.settings.shadeWeekends && cal.isWeekend(day) ? Color.primary.opacity(0.05) : Color.clear)
        .opacity(inMonth ? 1 : 0.5)
        .contentShape(Rectangle())
        .onTapGesture(count: 2) {
            state.editor = EditorRequest(start: cal.date(on: day, minutes: 9 * 60))
        }
        .onTapGesture {
            if let clip = state.clipboard {
                let minutes = clip.isAllDay ? 0 : cal.minutesSinceStartOfDay(clip.start)
                if store.copy(clip, toStart: cal.date(on: day, minutes: minutes)) {
                    state.showToast(String(localized: "Pasted"))
                }
            } else {
                withAnimation(.snappy(duration: 0.2)) { state.date = day }
            }
        }
        .contextMenu {
            Button { state.editor = EditorRequest(start: cal.date(on: day, minutes: 9 * 60)) } label: {
                Label("New Event", systemImage: "plus")
            }
            Button { state.open(day: day) } label: {
                Label("Day", systemImage: CalendarViewMode.day.symbol)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(day.formatted(.dateTime.weekday(.wide).day().month(.wide))))
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
    }

    /// One dot per calendar colour, at most four.
    private var dotColors: [Color] {
        var seen: [String] = []
        for item in items where !seen.contains(item.colorHex) {
            seen.append(item.colorHex)
            if seen.count == 4 { break }
        }
        return seen.map { Color(hex: $0) ?? .accentColor }
    }

    private func numberColor(isToday: Bool, isSelected: Bool) -> Color {
        if isSelected { return .white }
        if isToday { return .weekdotRed }
        return .primary
    }
}

/// List row as in the screenshot: coloured dot, title, place and time.
private struct MonthListRow: View {
    let item: EventItem

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Circle()
                .fill(Color(hex: item.colorHex) ?? .accentColor)
                .frame(width: 11, height: 11)
                .padding(.top, 5)
            VStack(alignment: .leading, spacing: 2) {
                Text(item.displayTitle)
                    .font(.body.weight(.medium))
                    .lineLimit(1)
                    .strikethrough(item.isDeclined)
                if let loc = item.location, !loc.isEmpty {
                    Text(loc)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Text(Fmt.timeRange(item))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            if item.isRecurring {
                Image(systemName: "repeat").font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 3)
    }
}
