# GeometryReader

## Under the hood

`GeometryReader` is a layout participant. It receives a proposed size from its parent, then reports its own size (usually the full proposed size) and provides the geometry to its content.

Because it reads layout information, changes that affect the proposal can invalidate the reader and often its parent. Nested readers or readers placed inside frequently updating containers (especially list rows) amplify this into layout thrash.

Modern alternatives that avoid the full layout dependency:
- `visualEffect` (for effects that need geometry)
- `onGeometryChange` (iOS 16+)
- `containerRelativeFrame`
- `ViewThatFits`, custom `Layout`

## Performance smells

### GeometryReader inside list / lazy rows
- **Cause**: Forces extra layout work on every scroll or parent update.
- **Fix**: Remove it; use intrinsic sizing or one of the alternatives above. If you truly need the size, measure once and cache.
- **Detect**: `GeometryReader` nested inside `List`, `LazyVStack`, or a row view.

### Nested or frequently updating readers
- **Cause**: Cascading invalidations.
- **Fix**: Lift the reader as high as possible or replace with a more targeted API.
- **Detect**: Multiple `GeometryReader`s in the same hierarchy, or a reader whose content depends on rapidly changing state.

## Evidence to seek

- High layout time in Instruments.
- Parent body re-evaluations correlated with geometry changes.
- Hitch spikes while scrolling past GeometryReader rows.

## Action plan output

```
### GeometryReader analysis
- H1: layout dependency in rows → thrash → measure layout time / body counts before and after removal
```
