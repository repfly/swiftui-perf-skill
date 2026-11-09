# Equatable views and .equatable()

## Under the hood

SwiftUI diffs view values. A custom `Equatable` conformance (or the `.equatable()` modifier) can short-circuit body evaluation when the relevant inputs have not changed. Closures and large captured state often defeat the default comparison.

## Performance smells

- Expensive body that re-runs because the view is not easily equatable (closures, large structs).
- Over-use of `.equatable()` that hides real dependency changes.
- Manual `Equatable` that compares too little or too much.

## Impact

- **Symptom**: excess body runs on parent updates.
- **Instruments**: View Body Updates count, `_printChanges`.
- **Severity**: Medium–High for frequently updating parents with expensive children.

## Evidence to seek

- `_printChanges` showing updates when inputs are stable.
- Reduction in body count after adding a correct `Equatable` conformance.

## Fixes

- Extract a lightweight `Equatable` child that only receives the values it needs.
- Prefer value types with stable equality over closures stored on the view.
- Measure before and after; wrong equality can hide bugs.

## Action plan output

```
### Equatable analysis
- H1: excess body runs → non-diffable inputs → add Equatable boundary and re-measure counts
```
