import SwiftUI
import WeatherKit

/// Required WeatherKit attribution: the official Apple Weather mark (light or dark) and the legal
/// attribution link, both as supplied by WeatherKit itself (`WeatherService.attribution`). Falls back to the
/// plain service name and Apple's documented legal page when the attribution can't be loaded (offline).
struct WeatherAttributionView: View {
    @Environment(\.colorScheme) private var scheme
    @State private var attribution: WeatherAttribution?

    private static let fallbackLegal = URL(string: "https://weatherkit.apple.com/legal-attribution.html")!

    var body: some View {
        HStack(spacing: 10) {
            mark
            Spacer(minLength: 0)
            Link(destination: attribution?.legalPageURL ?? Self.fallbackLegal) {
                Text("Legal attribution").font(.footnote)
            }
        }
        .task {
            if attribution == nil { attribution = try? await WeatherKit.WeatherService.shared.attribution }
        }
    }

    @ViewBuilder private var mark: some View {
        let name = attribution?.serviceName ?? "Apple Weather"
        if let a = attribution {
            AsyncImage(url: scheme == .dark ? a.combinedMarkDarkURL : a.combinedMarkLightURL) { phase in
                if let image = phase.image {
                    image.resizable().scaledToFit()
                } else {
                    Text(name).font(.footnote.weight(.semibold))
                }
            }
            .frame(height: 13)
            .accessibilityLabel(Text(name))
        } else {
            Text(name).font(.footnote.weight(.semibold)).foregroundStyle(.secondary)
        }
    }
}
