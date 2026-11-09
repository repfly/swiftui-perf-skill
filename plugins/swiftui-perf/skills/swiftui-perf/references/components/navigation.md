# Navigation (NavigationStack / NavigationLink / NavigationPath)

## Under the hood

Pushing a destination creates the destination view (and its body) on the main thread. Unstable path identity or a destination whose `init`/`body` does heavy work stalls the transition. Wide observation of the navigation path or a shared router can invalidate many screens when the path changes.

## Performance smells

- Expensive work in the destination `init` or `body` (formatters, sorting, image decode, network starts).
- Destination identity that changes on every parent update (new value type path elements, `AnyView` destinations).
- Observing a large navigation model from many places.
- Eager creation of all destinations instead of lazy.

## Impact

- **Symptom**: slow push, hitch on navigation, lost state on back.
- **Instruments**: Long View Body Updates on the destination, Time Profiler during the transition, Hitches.
- **Severity**: High for user-perceived navigation lag.

## Evidence to seek

- Marker or Time Profiler around the push.
- `_printChanges` on the destination while the parent updates.
- Memory spikes if destinations hold large data.

## Fixes

- Keep destination `init` and `body` light; move heavy work to `.task` or a view model that loads after appearance.
- Use stable path elements (Identifiable models).
- Avoid observing the entire path from leaf views.

## Action plan output

```
### Navigation analysis
- H1: slow push → destination body / init cost → measure with markers + SwiftUI instrument
```
