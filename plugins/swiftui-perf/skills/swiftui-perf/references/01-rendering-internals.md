# 01. How SwiftUI renders

Use this file to turn a symptom into a hypothesis. Each rule says what makes SwiftUI do more work.

## AttributeGraph

- AttributeGraph (AG) is a private framework. It holds a directed graph of attributes.
- Sources are `@State`, `@StateObject`, `@ObservedObject`, `@EnvironmentObject` and environment values. The sink is the root display list.
- Each view `body` is one node. A source change marks the source changed and its dependents dirty.
- Before the frame, SwiftUI pulls only the dirty attributes that the draw output needs.
- Body evaluation is not drawing. A body can run and produce the same output; that costs CPU but no pixels.
- Sources: [rensbr.eu attribute graph](https://rensbr.eu/blog/swiftui-attribute-graph/), [WWDC25-306](https://developer.apple.com/videos/play/wwdc2025/306/).

## Identity

- Explicit identity comes from `.id()` and from `ForEach` with `Identifiable` or `id:`.
- Structural identity comes from the type and the position in the view tree. An `if` becomes `_ConditionalContent`.
- State lives as long as the identity. A branch flip or a new `.id` value destroys the state and builds the subtree again.
- Source: [WWDC21-10022](https://developer.apple.com/videos/play/wwdc2021/10022/).

## Update order

1. The parent body builds a new view value for the child.
2. SwiftUI refreshes the child's dynamic properties.
3. SwiftUI compares the new value with the old value.
4. The child body runs only if an input or a dependency changed.

- `List` collects all IDs eagerly, also for rows that are not visible.
- Source: [WWDC23-10160](https://developer.apple.com/videos/play/wwdc2023/10160/).

## Render loop

- SwiftUI coalesces invalidations. Bodies run in a run-loop observer.
- The CATransaction commits at `beforeWaiting`. The render server is a separate process.
- A frame misses its deadline in two ways: one slow body, or many small updates in the same frame.
- Frame budget: 8.3 ms at 120 Hz (ProMotion), 16.7 ms at 60 Hz.
- Source: [rensbr.eu render loop](https://rensbr.eu/blog/swiftui-render-loop/).

## Diffing

- POD views (only value fields) are compared with `memcmp`. This is the cheapest path.
- Other views are compared field by field through reflection. Class fields are compared by reference.
- An `Equatable` view with `.equatable()` uses `==`.
- Closures always compare unequal. One closure field makes the view non-diffable, so its body runs on each parent update.
- Sources: [Chris Eidhof](https://chris.eidhof.nl/note/swiftui-view-equality), [Airbnb](https://airbnb.tech/web/understanding-and-improving-swiftui-performance/).

## ObservableObject (before iOS 17)

- `@Published` sends `objectWillChange` before each write, also for an equal value.
- Every view that observes the object runs its body again. SwiftUI does not know which property changed.
- One wide object (many `@Published`) observed by many views gives a large fan-out.
- `@Observable` needs iOS 17. Below that `deploymentTarget`, [swift-perception](https://github.com/pointfreeco/swift-perception) is a backport; adding it needs the user's OK.

## Environment

- Each `@Environment` reader is checked on each environment change.
- A default value that allocates a new class instance on each access invalidates its readers every time.
- A root `.environmentObject(Router.shared)` makes every `@EnvironmentObject` reader observe all `@Published` properties of that object. A router with many published paths and sheets fans out on every push.
- Source: [nilcoalescing](https://www.nilcoalescing.com/blog/UnstableDefaultEnvironmentValuesInSwiftUI).

## Navigation and lists

- A router with one published path per tab publishes `objectWillChange` for every observer on a push in any tab.
- Lists: on iOS 15 `List` uses `UITableView`, on iOS 16+ `UICollectionView`. `LazyVStack` builds lazily but does not reuse views.
- Reimplementations to read internal types: [OpenSwiftUI](https://github.com/OpenSwiftUIProject/OpenSwiftUI), [OpenAttributeGraph](https://github.com/OpenSwiftUIProject/OpenAttributeGraph).

## Symptom to hypothesis

| Symptom | First hypothesis | Check |
|---|---|---|
| Screen push is slow, CPU busy | destination `init` or body does heavy work | Time Profiler on the push window |
| Push is slow, CPU idle | waiting for network or a lock | Hangs triage (blocked), net lines |
| Typing or a toggle lags | wide view model fan-out | `_printChanges` count per keystroke |
| Scroll hitches | row bodies non-diffable, images decoded on main | Hitches + SwiftUI instrument on device |
| State resets on return | identity change (`.id`, `if` branch) | `_printChanges` shows `@identity` |

## Action plan output

Write this block into `findings.md`:

```
### Rendering hypotheses
- H1: <symptom> -> <mechanism from this file> -> <check to run>
- H2: ...
Next phase: static scan (03) for the files of the hypotheses.
```
