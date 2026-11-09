# Measurement Playbook

How SwiftUI app performance is measured in practice (Instruments, XCTest metrics, field data). Load this when you need evidence or when Phase 4/5 starts.

## Core principle

Measure on a **real device** in a **Release / profile build**. Simulator numbers are relative deltas only. Debug builds (including `_printChanges`) are directional and often misleading because of missing optimizations and extra logging.

## SwiftUI template in Instruments (Instruments 26 / Xcode 26+)

The SwiftUI template contains:

- **SwiftUI instrument**
  - **Update Groups**: when SwiftUI is doing work. Empty lane + high CPU → problem is outside SwiftUI.
  - **Long View Body Updates**: body property taking too long (orange/red = higher hitch/hang risk).
  - **Long Representable Updates**: UIViewRepresentable / NSViewRepresentable updates.
  - **Other Long Updates**: remaining long SwiftUI work.
  - Subtracks: View Body Updates, Representable Updates, Other Updates.
  - Cause & Effect Graph (when available) for data-flow visualization.
- **Time Profiler**: CPU samples.
- **Hangs** and **Hitches**: responsiveness.

### How to use

1. Profile (Cmd+I) → choose SwiftUI template → record on device.
2. Reproduce the exact interaction (scroll, navigate, type, animate).
3. Stop. Inspect Long View Body Updates first (start with red).
4. Correlate a hitch interval with the SwiftUI lanes and Time Profiler call tree.
5. Invert call tree, hide system libraries, flatten recursion to see your code.

## Key metrics people track

| Metric | Tool | Target / note |
|--------|------|---------------|
| Hitch time ratio | Animation Hitches instrument, `XCTHitchMetric` | <5 ms/s good, 5–10 investigate, ≥10 fix. ms of hitch per second of test. |
| View body count + duration | SwiftUI instrument (View Body Updates) | Excess count or high avg/max duration. |
| Launch time | App Launch template, `XCTApplicationLaunchMetric`, MetricKit / Organizer | Time to first draw + extended launch tasks. |
| Memory footprint | Allocations instrument | Growth while scrolling; physical footprint vs limit. |
| Long body updates | Long View Body Updates lane | Missed frame deadlines (≈8.3 ms @ 120 Hz, ≈16.7 ms @ 60 Hz). |

## Capture recipes by symptom

- **Scroll hitch / jank**: SwiftUI + Hitches on device, Release. Interact by scrolling the problematic list.
- **Slow screen open / navigation**: Marker patch + Time Profiler + SwiftUI. Navigate to the screen.
- **Typing lag / toggle lag**: `_printChanges` (debug) for count + SwiftUI instrument for cost.
- **High memory while scrolling**: Allocations + SwiftUI.
- **Slow launch**: App Launch template on device.

## XCTest performance metrics

Suggest these only when `rules.testException` allows or the user asks:

- `XCTHitchMetric` — scroll / animation hitch ratio.
- `XCTApplicationLaunchMetric` — launch.
- `XCTMemoryMetric`, `XCTCPUMetric`, `XCTClockMetric`.
- `XCTOSSignpostMetric` for custom regions.

## Field data

Xcode Organizer + MetricKit for real-user launch, hang, and hitch histograms. Use after local evidence is solid.

## Action plan output

```
### Measurement plan
- Symptom: <symptom>
- Recipe: <SwiftUI template / markers / XCTest metric>
- Target: device + profile build
- Lanes to inspect: Long View Body Updates, Hitches, Time Profiler
```
