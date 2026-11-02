import SwiftUI

/// "More apps by the developer" card at the bottom of Settings, in Weekdot's own colours. Opens lrvdlinden.app.
struct MoreAppsCard: View {
    private let gradient = LinearGradient(colors: [Color(red: 1.0, green: 0.42, blue: 0.33), Color.weekdotRed,
                                                   Color(red: 0.72, green: 0.13, blue: 0.11)],
                                          startPoint: .topLeading, endPoint: .bottomTrailing)

    var body: some View {
        HStack(spacing: 14) {
            RoundedRectangle(cornerRadius: 13, style: .continuous)
                .fill(gradient)
                .frame(width: 56, height: 56)
                .overlay(
                    Image(systemName: "square.grid.2x2.fill")
                        .font(.system(size: 24, weight: .semibold))
                        .foregroundStyle(.white)
                )
                .shadow(color: Color.weekdotRed.opacity(0.25), radius: 6, y: 3)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 3) {
                Text("More Apps by the Developer")
                    .font(.headline)
                    .foregroundStyle(Color.weekdotRed)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Apps for iPhone, iPad, Apple TV and Homey")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            VStack(spacing: 2) {
                Text("Visit")
                    .font(.headline)
                    .foregroundStyle(Color.weekdotRed)
                Text(verbatim: "lrvdlinden.app")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .fixedSize()
        }
        .padding(.vertical, 6)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isLink)
    }
}
