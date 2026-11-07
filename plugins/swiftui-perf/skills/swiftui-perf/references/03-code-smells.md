# 03. Code-smell catalogue

Run `scripts/smell_scan.sh` first. It runs every "Detect" pattern below and writes a table. A grep hit is a suspect, not a finding. A suspect becomes a finding only with trace or count evidence (02, 04, 05).

Format: smell → cause → fix → detect. Check each fix API against `deploymentTarget`.

## State and observation

- **Wide view models.** Many `@Published` properties feed one `objectWillChange`, so every observer runs its body again.
  Fix: split the model by change rate, pass plain values to children, use `removeDuplicates` before `assign`.
  Detect: more than 8 `@Published` in one file.
- **Singletons observed widely** (`@ObservedObject var x = Store.shared`, root `.environmentObject`).
  Fix: read the store in a thin container view and map it to value types for the children.
  Detect: `(ObservedObject|StateObject)[^=]*=\s*\w+\.(shared|default)`.
- **Equal-value writes and manual `objectWillChange.send()`.**
  Fix: guard before the write (`if x != new { x = new }`), `removeDuplicates`, `debounce`.
  Detect: `objectWillChange\.send\(\)`.
- **Owned object as `@ObservedObject var vm = VM()`.** The object is built again on each parent body.
  Fix: `@StateObject`.
  Detect: `@ObservedObject\s+(private\s+)?var\s+\w+(\s*:\s*\w+)?\s*=\s*\w+\(`.
- **Heavy `init` in views, or `@State var m = Model()`.**
  Fix: keep view inits empty, load in `.task`, make destinations lazy.
  Detect: `init(` in `*View.swift` that calls fetch, decode or `sink`.
- **Rows that read a whole shared collection** (`favorites.contains(item)` in a row).
  Fix: pass a precomputed `Bool` per row.

## Identity and lists

- **AnyView.** It hides the type and is most costly per row.
  Fix: `@ViewBuilder`, generics, `some View`.
  Detect: `AnyView\(|->\s*AnyView|\[AnyView\]`.
- **Variable view count per `ForEach` element** (`if` at the top of a row).
  Fix: filter in the model, or wrap the row in one `VStack`.
- **Conditional modifier helpers** (`.if(cond)`). They change identity.
  Fix: vary the value (`.opacity(c ? 1 : 0)`).
  Detect: `\.if\(|\.applyIf\(|\.when\(`.
- **Unstable IDs** (`.indices`, `id: \.self` on mutable data, `UUID()` in a computed `id`).
  Detect: `ForEach\([^)]*\.indices|id:\s*\\\.self|var id:.*UUID\(\)`.
- **`.id(token)` to force a refresh.** It resets state and makes `List` rows build eagerly.
  Detect: `\.id\((UUID\(\)|refresh|reload)`.
- **Eager stacks.** `ScrollView { VStack { ForEach } }` builds all rows.
  Fix: `LazyVStack` or `List`. `@State` deep in lazy rows can reset.
  Detect: `ScrollView` followed by `VStack` and `ForEach` (scan prints candidates).

## Diffing

- **Closures stored on views.** They make the view non-diffable.
  Fix: `Equatable` plus `.equatable()`; compare only the data fields.
- **Large bodies and helper `some View` properties.** They are inlined, so there is no diff boundary.
  Fix: extract structs with narrow inputs.

## Layout, drawing and images

- **GeometryReader and preferences in cells; scroll offset in `@State` on each frame.**
  Fix: measure once, store coarse values, compare before the write. `onGeometryChange` needs iOS 16 (back-deployed); check `deploymentTarget`.
  Detect: `GeometryReader`.
- **Images.** `AsyncImage` has no real cache and decodes at full size.
  Fix: reuse the project's cached image view if it has one; downsample with `CGImageSourceCreateThumbnailAtIndex` off the main thread.
  Detect: `AsyncImage\(|UIImage\(data:`.
- **Shadow, blur and mask on many rows.** They cause offscreen passes.
  Fix: `.compositingGroup()` before `.shadow` on containers; `.drawingGroup()` only after a measurement.
  Detect: `\.shadow\(|\.blur\(|\.mask\(`.
- **Formatters and sort or filter in `body`.**
  Fix: `static let` formatters, precomputed values in the view model.
  Detect: `(Date|Number)Formatter\(\)` not in a `static let`.
- **Implicit `.animation(_:)` without `value:`.**
  Detect: `\.animation\(\.[a-zA-Z]+(\([^)]*\))?\)`.

## Main thread

- **Work on the main thread.** `.task` inherits the main actor. JSON decode in a `@MainActor` view model stays on main.
  Fix: a `nonisolated` helper or a detached task for decode; one hop back to assign.
  Detect: `JSONDecoder\(\)\.decode` in view-model files; `DispatchQueue.main.sync`.

## Ownership and timers

- **A parent owns a child screen's view model as `@StateObject`.** Every publish of the child model runs the parent body again, and with it the parent's whole subtree.
  Fix: keep the child model in a holder that does not publish (a plain class or a `let` in a non-observed store), or create it in the child with `@StateObject`.
  Detect: `smell_scan.sh` section "parent-owns-child-view-model" (`@StateObject` of a `<Other>ViewModel` in `<Name>View.swift`).
- **A fast timer copied into a screen-wide `@Published`.** A 1 s countdown in a wide view model runs every observer once per second.
  Fix: keep the tick in a small child view with its own `@State` or `TimelineView` (iOS 15), or publish it from a separate small object.
  Detect: `smell_scan.sh` section "timer-into-published".

## Shared stores

- Count the observers of each singleton store (`smell_scan.sh` "singleton-observed", "environment-object"). Converting a store is its own task.
- Rank suspects by the screens in scope, not by the hit count.

## Action plan output

```
### Static suspects (scripts/smell_scan.sh, <date>)
| # | File:line | Smell | Screen | Evidence needed |
|---|---|---|---|---|
| S1 | ... | wide view model (14 @Published) | Home | _printChanges count per tab switch |
Ranked by: screen in scope first, then rows/scroll paths, then count.
Next phase: instrumented run (05) on the top 3 suspects.
```
