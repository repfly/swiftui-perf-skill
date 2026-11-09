# Symptom → Measurement → Component Map

Use this after intake to decide what to measure and which component references to load. Keep context small.

| Symptom | First measurement | Likely components / topics | Load these |
|---------|-------------------|----------------------------|------------|
| Scroll hitch / jank / stutter | SwiftUI template + Hitches on device (Release) | List, LazyVStack, Image, GeometryReader, effects, ForEach slow path | list, lazy-stack, image, geometry-reader, effects, foreach |
| Slow screen open / slow push | Markers + Time Profiler + SwiftUI | Navigation destination init/body, network, wide observation | navigation, state-observation, network refs |
| Typing lag / toggle lag / extra body runs | `_printChanges` count (debug) + SwiftUI instrument | Wide model, environment objects, parent observation, Equatable boundaries | state-observation, equatable |
| High memory while scrolling | Allocations + SwiftUI | Images, drawingGroup, List vs Lazy (no reuse), large view trees | image, effects, list, lazy-stack |
| Slow launch | App Launch template + MetricKit / Organizer | Early main-thread work, SDK init, first-screen body | launch reference (06) |
| Animation hitch / paused animation | SwiftUI + Hitches, correlate with Long View Body | Animations, effects, layout changes during animation | animations, effects |
| Nested scrollers or content offset driven updates | SwiftUI + Time Profiler | ScrollView, state updated from offset | scrollview |

Always prefer the component files over the monolithic catalogues. Fall back to `01-rendering-internals.md` or `03-code-smells.md` only when the general model is required.

## Action plan output

```
### Symptom routing
- Symptom: <symptom>
- Measurement recipe: <recipe>
- Component files to load: <list>
```
