# List

## Under the hood

- On iOS 15 and earlier `List` is backed by `UITableView`. From iOS 16 it uses `UICollectionView`.
- It **eagerly collects identifiers** for every element (including off-screen rows) so it can compute the total number of rows and support scrolling.
- It has **cell reuse**. Views that scroll off-screen can be recycled and rebound.
- Unstable identity (changing IDs, `id: \.self` on mutable values, `UUID()` created in the body) or a non-constant number of views per `ForEach` element defeats both laziness and reuse.
- A single slow row body or a row that is not easily diffable can hitch the whole scroll.

## Performance smells

### GeometryReader inside rows
- **Cause**: GeometryReader participates in layout and can force the parent (and often the whole list) to re-layout when size is read.
- **Fix**: Prefer fixed or intrinsic sizing. Use `visualEffect`, `onGeometryChange` (iOS 16+), or `containerRelativeFrame` when you need size information.
- **Detect**: `GeometryReader` inside a List / ForEach row.

### Unstable identity
- **Cause**: SwiftUI cannot match old rows to new rows → full rebuilds, lost `@State`, reset animations.
- **Fix**: Use a stable model `id` (`Identifiable` or `id: \.id`). Never generate `UUID()` inside the view body or use `\.self` on types whose equality changes.
- **Detect**: `id: \.self`, `UUID()` in ForEach / row, or `.id(UUID())`.

### ForEach slow path (variable view count)
- **Cause**: `if`, `AnyView`, or other constructs that produce 0 or N views per element force SwiftUI to eagerly evaluate every element to count rows.
- **Fix**: Filter or transform the data **before** the ForEach so each element produces a constant number of views. Wrap heterogeneous content in a single concrete view when possible.
- **Detect**: `if` or `AnyView` directly inside a `ForEach` that lives in a List. Launch with `-LogForEachSlowPath YES` to see the diagnostic.

### Heavy work or image decoding in the row body
- **Cause**: Body runs on the main thread for every visible (and sometimes nearby) row.
- **Fix**: Precompute formatted strings, sort/filter outside the view, downsample images off the main actor, cache results.
- **Detect**: `DateFormatter()`, `NumberFormatter()`, `JSONDecoder().decode`, `UIImage(data:)` inside row views.

### Broad observation
- **Cause**: A wide `@Observable` or `ObservableObject` observed by every row invalidates all rows on any property change.
- **Fix**: Pass only the properties the row actually needs, or split the model by change frequency. Use `@Observable` for granular tracking (iOS 17+).
- **Detect**: Large view models with many published properties observed by list rows.

## Evidence to seek

- Animation Hitches instrument on a device while scrolling.
- SwiftUI instrument (long view body updates).
- `_printChanges` on a representative row while scrolling or while unrelated state changes.
- Allocations instrument for image memory growth.

## Targeted fixes (examples)

```swift
// Prefer stable identity + filtered data
List(filteredItems) { item in
    RowView(item: item)   // lightweight, ideally Equatable if body is expensive
}

// Instead of
List {
    ForEach(items) { item in
        if item.isVisible {
            RowView(item: item)
        }
    }
}
```

## Action plan output

```
### List analysis
- H1: <symptom> → List eager ID / reuse / slow path → <check>
```
