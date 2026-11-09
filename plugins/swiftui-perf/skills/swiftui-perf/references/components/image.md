# Image / AsyncImage

## Under the hood

Image decoding and resizing happen on the main thread by default when a view is created. Large source images decoded at full resolution cause both CPU hitches and large memory spikes. `AsyncImage` is convenient but does not downsample by default.

## Performance smells

- `UIImage(data:)` or full-resolution decode inside a list row body.
- No downsampling to display size.
- Missing cache for remote images.
- `drawingGroup` or effects applied to many images.

## Impact

- **Symptom**: scroll hitch, memory growth while scrolling, high CPU on image-heavy screens.
- **Instruments**: Allocations (memory), Time Profiler / Long View Body Updates (decode), Hitches.
- **Severity**: High in image-heavy lists.

## Evidence to seek

- Allocations growth correlated with scroll.
- Time spent in image decode functions in Time Profiler during body updates.

## Fixes

- Downsample off the main actor to the target size before displaying.
- Use a proper image cache (or a library that does this).
- Prefer `AsyncImage` with a custom phase that shows a placeholder and loads a pre-sized image.
- Avoid per-row `drawingGroup` on images.

## Action plan output

```
### Image analysis
- H1: hitch / memory → main-thread full-size decode → downsample off-main and re-measure
```
