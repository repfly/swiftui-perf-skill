# Component Reference Index

This index lets the agent load only the knowledge relevant to the components that appear in a screen. Do not load every component file on every run.

## How to use

1. Run `scripts/smell_scan.sh` (or inspect the code of the target screen).
2. Note which components or smell categories appear.
3. Read **only** the matching files below (plus `01-rendering-internals.md` when you need the general AttributeGraph / identity / diffing model).
4. Prefer the component file over the monolithic `03-code-smells.md` for targeted analysis. The full catalogue remains available as a fallback.

## Index

| Component / topic | Load when | File | Key under-the-hood points | Primary smells |
|-------------------|-----------|------|---------------------------|----------------|
| List | `List` or rows inside List | [list.md](list.md) | Eager ID collection; UICollectionView (iOS 16+) / UITableView (iOS 15); cell reuse; sensitive to unstable identity and variable view counts | GeometryReader in rows, unstable IDs, ForEach slow path, heavy row bodies, image decode |
| LazyVStack / LazyHStack | Lazy* containers | [lazy-stack.md](lazy-stack.md) | Native SwiftUI lazy creation, **no cell reuse**, estimated total height | Same ForEach slow path, GeometryReader, expensive row init |
| ForEach | Any ForEach | [foreach.md](foreach.md) | Constant views-per-element required for fast path in lazy containers | `if` / AnyView inside closure, filtering/sorting in body, unstable `id` |
| GeometryReader | GeometryReader usage | [geometry-reader.md](geometry-reader.md) | Layout dependency; can invalidate parent | Nested readers, readers inside list rows |
| AnyView | AnyView / type erasure | [anyview.md](anyview.md) | Destroys structural identity | Used to hide conditionals or heterogeneous rows |
| Effects / drawingGroup | `.drawingGroup()`, `.shadow`, `.blur`, `.mask` on many rows | [effects.md](effects.md) | Flattens to bitmap; costly when content changes often | Per-row shadows/blurs/masks, drawingGroup on animated/text content |
| State & observation | Wide models, `@Observable`/`ObservableObject`, environment objects | [state-observation.md](state-observation.md) | AttributeGraph fan-out; `@Published` vs granular `@Observable` | Wide view models, closures capturing self, environment object storms |
| Cross-cutting rendering | Always available (small) or when no specific component matches | `../01-rendering-internals.md` | AttributeGraph, identity, diffing (memcmp / Equatable / reflection) | General hypotheses |

## Action plan output

When you finish the static scan phase, include:

```
### Component-targeted analysis
- Components detected: <list>
- Files loaded: <list of component files>
- Top component-specific hypotheses:
  - H1: <component> → <mechanism> → <check>
```
