# Animations and transitions

## Under the hood

SwiftUI animations can run off the main thread for many built-in properties, but layout changes, body work, and some custom animations still hit the main thread. Animating layout (frame, padding) is usually more expensive than animating transforms or opacity. On ProMotion displays the budget is tighter (~8.3 ms).

## Performance smells

- Animating layout properties instead of transform/opacity.
- Expensive body or layout work during an animation.
- Implicit animations triggered by frequent state changes.
- `drawingGroup` or heavy effects on animating content.

## Impact

- **Symptom**: hitch or dropped frames during animation / transition.
- **Instruments**: Hitches correlated with Long View Body Updates or layout work.
- **Severity**: High for visible motion.

## Evidence to seek

- Hitch intervals during the animation.
- Time Profiler samples on the main thread while the animation runs.

## Fixes

- Prefer transform and opacity animations.
- Keep bodies light during animated state changes.
- Use explicit animations only where needed; avoid broad implicit ones.
- Profile on device at the target refresh rate.

## Action plan output

```
### Animation analysis
- H1: hitch during animation → layout or body work on main → switch to transform / lighten body and re-measure
```
