# ScrollView

## Under the hood

A plain `ScrollView` with non-lazy content (VStack of many children) creates all children up front. Nested scroll views and content-offset-driven state updates are common sources of thrash. Prefer `List` or `LazyVStack` for large collections.

## Performance smells

- Large non-lazy content inside `ScrollView`.
- Nested `ScrollView`s.
- State updated from `GeometryReader` or preference keys on every scroll offset change.
- Heavy children that are created even when off-screen.

## Impact

- **Symptom**: hitch on scroll, high memory, laggy nested scrolling.
- **Instruments**: Long View Body Updates, Hitches, Allocations.
- **Severity**: High when the content is large.

## Evidence to seek

- Body counts for off-screen items.
- Memory growth while scrolling.
- Preference or geometry updates firing continuously.

## Fixes

- Use `LazyVStack` inside `ScrollView` or switch to `List` for large data.
- Avoid continuous state updates from scroll offset; debounce or use more targeted APIs.
- Flatten nested scrollers when possible.

## Action plan output

```
### ScrollView analysis
- H1: eager children / offset-driven state → hitch → convert to Lazy / List and re-measure
```
