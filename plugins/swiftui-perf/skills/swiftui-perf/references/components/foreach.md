# ForEach

## Under the hood

Lazy containers (`List`, `LazyVStack`, `LazyHStack`) need to know how many views each element of a `ForEach` produces so they can take the fast path (index-based access without eagerly building everything).

If the number of views per element is **not constant** (because of `if`, `AnyView`, or other conditional content), SwiftUI falls back to a slow path: it must evaluate the closure for every element to count the views. This defeats laziness and can cause large stalls when the collection is big.

Apple documents this; you can also surface the diagnostic with the launch argument `-LogForEachSlowPath YES`.

## Performance smells

### Variable view count inside the closure
- **Cause**: Slow path in lazy containers.
- **Fix**: Filter, map, or otherwise transform the data so each element produces exactly the same number of views (usually 1). Prefer a concrete view over `AnyView`.
- **Detect**: `if` / `switch` that can produce zero or multiple views, or `AnyView` inside the `ForEach` content closure.

### Filtering or sorting inside the view
- **Cause**: Recomputed on every body evaluation.
- **Fix**: Compute the filtered/sorted collection outside the view (in the model or a parent that only updates when the source changes).
- **Detect**: `.filter`, `.sorted`, `.map` inside the `ForEach` initializer or content.

### Unstable identity
- **Cause**: Same as List — forces rebuilds.
- **Fix**: Stable `id` from the model.
- **Detect**: `id: \.self` on non-stable types, `UUID()` created per render.

## Evidence to seek

- Console output with `-LogForEachSlowPath YES`.
- Excess body evaluations of row views for off-screen items.
- Hitches or long view body updates correlated with collection size.

## Action plan output

```
### ForEach analysis
- H1: variable view count → slow path → confirm with -LogForEachSlowPath and body counts
```
