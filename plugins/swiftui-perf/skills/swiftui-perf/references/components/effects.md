# Effects and drawingGroup

## Under the hood

`.drawingGroup()` flattens the view (and its children) into an offscreen bitmap rendered by Metal. This can be a win for complex static shapes, but:

- The bitmap is recreated whenever the content changes.
- Applied to many list rows it multiplies memory and CPU/GPU cost.
- Text and frequently animating content usually suffer more than they gain.
- Interactivity and certain blending modes can break or become expensive.

Per-row `.shadow()`, `.blur()`, and `.mask()` are similarly costly when applied to every cell.

## Performance smells

- `.drawingGroup()` on list rows or on views whose content changes often.
- `.shadow`, `.blur`, or `.mask` applied inside a ForEach / List row.
- drawingGroup on Text.

## Fixes

- Apply expensive effects only to static decorative elements.
- Prefer cheaper alternatives (opacity, simple shapes) when profiling shows the effect is the bottleneck.
- Profile before and after; drawingGroup is not a free performance button.

## Evidence to seek

- GPU / CPU spikes correlated with the effect in Instruments while scrolling.
- Memory growth from bitmaps.

## Action plan output

```
### Effects analysis
- H1: per-row effect / drawingGroup → hitch or memory → remove or limit and re-measure
```
