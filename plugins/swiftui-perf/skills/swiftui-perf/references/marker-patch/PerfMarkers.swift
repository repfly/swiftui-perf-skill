import Foundation
import os
import SwiftUI

final class PerfMarkers {

    static let shared = PerfMarkers()
    static let subsystem = "__SUBSYSTEM__"

    let isEnabled: Bool

    private struct Pending {
        let name: String
        let start: Double
        let state: OSSignpostIntervalState
        let signpostID: OSSignpostID
        var appeared: Bool
    }

    private let signposter: OSSignposter
    private let logger: Logger
    private var pending: [Pending] = []

    private init() {
        isEnabled = UserDefaults.standard.bool(forKey: "PerfMarkers")
        signposter = isEnabled ? OSSignposter(subsystem: Self.subsystem, category: .pointsOfInterest) : .disabled
        logger = Logger(subsystem: Self.subsystem, category: "screen")
    }

    static var nowMs: Double {
        Date().timeIntervalSince1970 * 1000
    }

    func screenRequested<Screen>(_ screen: Screen) {
        guard isEnabled else { return }
        let described = String(describing: screen)
        let name = described.split(separator: "(", maxSplits: 1).first.map(String.init) ?? described
        begin(name)
    }

    func begin(_ name: String) {
        guard isEnabled else { return }
        let start = Self.nowMs
        let signpostID = signposter.makeSignpostID()
        let state = signposter.beginInterval("ScreenOpen", id: signpostID, "\(name, privacy: .public)")
        pending.append(Pending(name: name, start: start, state: state, signpostID: signpostID, appeared: false))
        log(name: name, phase: "requested", time: start, delta: 0)
    }

    func event(_ phase: String) {
        guard isEnabled else { return }
        let now = Self.nowMs
        let current = pending.last
        let name = current?.name ?? "none"
        let signpostID = current?.signpostID ?? .exclusive
        signposter.emitEvent("Event", id: signpostID, "\(name, privacy: .public) \(phase, privacy: .public)")
        log(name: name, phase: "event:\(phase)", time: now, delta: now - (current?.start ?? now))
    }

    func firstAppear() {
        guard isEnabled, let index = pending.indices.last, !pending[index].appeared else { return }
        pending[index].appeared = true
        let item = pending[index]
        let now = Self.nowMs
        signposter.emitEvent("FirstAppear", id: item.signpostID, "\(item.name, privacy: .public)")
        log(name: item.name, phase: "firstAppear", time: now, delta: now - item.start)
    }

    func contentReady() {
        guard isEnabled, let item = pending.popLast() else { return }
        let now = Self.nowMs
        signposter.endInterval("ScreenOpen", item.state, "\(item.name, privacy: .public)")
        log(name: item.name, phase: "contentReady", time: now, delta: now - item.start)
    }

    private func log(name: String, phase: String, time: Double, delta: Double) {
        let line = String(format: "PERF screen=%@ phase=%@ t=%.1f dt=%.1f", name, phase, time, delta)
        logger.notice("\(line, privacy: .public)")
    }
}

private struct PerfContentReadyModifier: ViewModifier {

    let ready: Bool
    @State private var reported = false

    func body(content: Content) -> some View {
        content
            .onAppear {
                PerfMarkers.shared.firstAppear()
                report(ready)
            }
            .onChange(of: ready) { value in
                report(value)
            }
    }

    private func report(_ value: Bool) {
        guard PerfMarkers.shared.isEnabled, value, !reported else { return }
        reported = true
        DispatchQueue.main.async {
            PerfMarkers.shared.contentReady()
        }
    }
}

extension View {

    func perfContentReady(_ ready: Bool) -> some View {
        modifier(PerfContentReadyModifier(ready: ready))
    }
}
