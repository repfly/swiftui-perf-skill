# State and observation

## Under the hood

SwiftUI’s AttributeGraph tracks dependencies. A source change marks dependents dirty; only dirty bodies are re-evaluated.

- Before iOS 17, `ObservableObject` + `@Published` sends `objectWillChange` on every write. Every observing view re-runs its body; SwiftUI does not know which property changed.
- `@Observable` (iOS 17+) tracks the specific properties a view actually reads, giving much finer invalidation.
- Closures are hard to compare. A closure stored on a view (or captured from the parent) often makes the view non-diffable, so its body runs on every parent update.
- A single wide model observed by many views creates high fan-out.

## Performance smells

### Wide view models
- **Cause**: One object with many `@Published` / observed properties invalidates every dependent view on any change.
- **Fix**: Split by change frequency, pass only the needed values down, or move to `@Observable` and read narrowly.
- **Detect**: View models with a large number of `@Published` properties, or many views observing the same object.

### Closures that capture self or large state
- **Cause**: Forces body re-evaluation whenever any captured value changes.
- **Fix**: Avoid storing escaping view-building closures. Capture only the values you need, or extract the closure’s result in the initializer.
- **Detect**: Closures stored in view properties or passed deep into the hierarchy that capture the parent.

### Environment objects that change often
- **Cause**: Every `@EnvironmentObject` reader is invalidated.
- **Fix**: Scope the environment object more narrowly or split the data.
- **Detect**: Root-level `.environmentObject` of a frequently mutating object.

## Evidence to seek

- `_printChanges` showing many unrelated views updating together.
- High body evaluation counts in the SwiftUI instrument for views that should be stable.

## Action plan output

```
### Observation analysis
- H1: fan-out from wide model → excess body runs → narrow observation or split model and re-measure
```
