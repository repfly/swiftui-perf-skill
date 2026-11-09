# AnyView

## Under the hood

`AnyView` type-erases its content. SwiftUI can no longer see the structural identity of the erased view. As a result, the subtree is treated as potentially different on every parent update, forcing re-evaluation and often full recreation of the underlying platform views.

This is especially harmful inside lists or any frequently updating parent.

## Performance smells

### Using AnyView to hide conditionals or heterogeneous content
- **Cause**: Loss of structural identity → excess body runs and state resets.
- **Fix**: Prefer generics, `@ViewBuilder`, `Group`, or an extracted concrete `View` struct. Use `AnyShapeStyle` only when a style ternary needs type erasure (this is not the same problem as `AnyView`).
- **Detect**: `AnyView(`, `-> AnyView`, or arrays of `AnyView`.

## Evidence to seek

- `_printChanges` showing identity changes or excess body runs.
- State loss or animation resets when the parent updates.

## Action plan output

```
### AnyView analysis
- H1: type erasure → lost identity → replace with concrete views and re-measure body counts
```
