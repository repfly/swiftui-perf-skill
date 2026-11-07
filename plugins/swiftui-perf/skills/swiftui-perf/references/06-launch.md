# 06. Launch

## Metrics

| Metric | Definition | Capture | Target |
|---|---|---|---|
| Cold launch TTFF | tap → first frame | App Launch template on device; `XCTApplicationLaunchMetric` (perf template) | < 400 ms on device |
| Launch to content | process start → first screen content | `markers.mjs apply --launch` + `.perfContentReady` on the first screen | < 1 s p50 (proposed) |
| Static init cost | dyld and `+load` / static initializers | App Launch template, Static Initializer lane | no app initializer > 10 ms |

- The system uses about 100 ms of the 400 ms.
- Prewarming makes "process start" misleading. iOS can start the process before the tap; use the first frame, not the process start time, for TTFF.
- `DYLD_PRINT_STATISTICS` does not work since dyld4.
- Source: [Apple: reducing launch time](https://developer.apple.com/documentation/xcode/reducing-your-app-s-launch-time).

## Find the launch path

- Entry: `apps[].entryFile` in the config (the `@main` App or the AppDelegate).
- List the SDKs set up before the first frame (analytics, crash reporting, attribution, push). Measure each one; do not trust published numbers.
- List the `debugTools` that start at launch. The profile build skips them only while the marker patch is applied.
- List the `securityGates`. A gate that closes or blocks the app on the simulator makes every launch number wrong; build with its flag (`build.sh profile` does it).

## Recipe: launch to content (simulator delta)

1. `markers.mjs apply --launch`. Add `.perfContentReady(<first screen content condition>)` on the first screen root view.
2. `build.sh profile` in the background, then install.
3. For each of N runs, with the log stream running (05): `xcrun simctl terminate <udid> <bundleId>`, then `xcrun simctl launch <udid> <bundleId> -PerfMarkers YES`, then wait 15 s.
4. `waterfall.mjs` reports the launch marker name as a screen: first render and time to content.

## Recipe: launch trace

```
bash <skill>/scripts/record.sh launch --out runs/launch-1.trace --seconds 15
node <skill>/scripts/summarize_trace.mjs runs/launch-1.trace --pid <printed pid> --window 0:3000 > runs/launch-1.json
```

- For the App Launch template on a device: `record.sh run --device <deviceUdid> --template 'App Launch' --time-limit 15s --bundle <bundleId> -- -PerfMarkers YES`. If export fails with "Document Missing Template", record with `--instrument 'Time Profiler' --instrument os_signpost` instead.
- On the device, record 5 cold launches. Reboot or wait 1 min between runs for a true cold launch.

## Common causes

- SDK setup on main before the first frame. Fix candidate: defer the SDKs that the first frame does not need. This is a product decision; ask first.
- A debug network inspector started at launch (0.8 to 3 s was seen). Profile with it off; report its cost apart.
- Synchronous Keychain, UserDefaults migration or file I/O in `init`.
- A large root view that builds all tabs eagerly.
- Many `@StateObject` or singleton inits at the root.
- Network calls that gate the first screen in series (07).

## Action plan output

```
### Launch (<target>, <build>, N=<n>)
- TTFF p50/p95: <ms> (device only)
- Launch to content p50/p95: <ms>
- Top main-thread cost before first frame: <symbol> <ms>
- SDK cost: <SDK> <ms>, ...; debug tools off: <list>; gates off by flag: <list>
Next: one change from the list above, then the same recipe (10).
```
