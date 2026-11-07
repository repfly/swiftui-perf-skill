# 05. Screen open metrics

Screen open time comes from the temporary marker patch. Every session applies the same patch, so baselines stay comparable.

## Markers

`markers.mjs apply` copies `references/marker-patch/PerfMarkers.swift` into `markers.appMarkerDir`, inserts the calls at each `markers.navigation` anchor, adds the network hook for `network.type`, and wraps each `debugTools` start line. `--launch` also inserts `begin("<name>")` at `markers.launch`.

| Phase | Where | Kind |
|---|---|---|
| `requested` | the navigation anchors call `PerfMarkers.shared.screenRequested(screen)` | log line + `ScreenOpen` interval begin |
| `firstAppear` | `.perfContentReady(_:)` modifier, first `onAppear` | log line + `FirstAppear` event |
| `contentReady` | `.perfContentReady(_:)`, first time `ready` is true, on the next main-queue turn | log line + `ScreenOpen` interval end |
| custom | `PerfMarkers.shared.begin("<name>")` for a screen that is not pushed (tab root, launch) | same as `requested` |
| custom event | `PerfMarkers.shared.event("<phase>")` | log line + `Event` signpost |

- The screen name is `String(describing: screen)` up to the first "(". Associated values are not logged.
- Markers are off unless the app starts with the launch argument `-PerfMarkers YES`. Off costs one `Bool` check.
- A root screen opened at launch has no navigate call. Use `apply --launch`, or add `PerfMarkers.shared.begin("<Name>")` by hand on its own line at app init.
- `markers.mjs` writes a state file in `workDir`. `revert` undoes each recorded edit and deletes every line that contains `PerfMarkers.`, `.perfContentReady(` or the guard check.

## Add the content-ready marker

Add the modifier to the root view of the target screen, on its own line, with the condition that means "content is on screen":

```swift
.perfContentReady(!viewModel.isLoading && viewModel.items != nil)
```

- Choose a condition the user sees: the first real content, not a loading skeleton.
- Keep every perf line on its own line, so revert removes only perf lines.

## Log format

All lines use `markers.subsystem`, level notice, `privacy: .public`, and an epoch-ms clock:

```
PERF screen=<name> phase=<requested|firstAppear|contentReady|event:<x>> t=<epochMs> dt=<ms since requested>
PERF net task=<id> method=<m> path=<p> status=<s> proto=<h2|http/1.1> reused=<0|1> cache=<network|localCache> dns=<ms> connect=<ms> tls=<ms> ttfb=<ms> download=<ms> total=<ms> start=<epochMs>
```

## Capture on the simulator

1. `markers.mjs apply` (and `--launch` for a root screen). Add `.perfContentReady(...)`.
2. `build.sh profile` in the background. Install the printed `.app` with `xcrun simctl install <udid> <path>`.
3. `runlog.mjs new runs/<run> build=profile target=sim temperature=<cold|warm> network=real`.
4. Start the log stream in the background:

```
xcrun simctl spawn <udid> log stream --style compact --level info \
  --predicate 'subsystem == "<markers.subsystem>"' > runs/<run>.log
```

5. Launch: `xcrun simctl launch --terminate-running-process <udid> <bundleId> -PerfMarkers YES`.
6. Go to the screen: a tap through the UI, or a deep link with `xcrun simctl openurl <udid> <url>`.
7. Repeat for N runs (10). Stop the log stream.
8. `node <skill>/scripts/waterfall.mjs runs/<run>.log > waterfall.md`.

## Capture on the device

- Record with the `os_signpost` and `os_log` instruments: `record.sh start --device <deviceUdid> --attach <processName> --instrument os_signpost --instrument os_log`.
- `summarize_trace.mjs --log-out runs/<run>.log` writes the PERF lines, so `waterfall.mjs` reads them too.

## Metrics

| Metric | Definition | Target |
|---|---|---|
| First render | `requested` → `firstAppear` | < 100 ms |
| Time to content | `requested` → `contentReady` | < 300 ms cached, < 1 s with network (proposed) |
| Client delay | `requested` → first request start | < 50 ms (proposed) |
| Network critical path | first gating request start → last gating response end | per screen baseline |
| UI tail | last gating response end → `contentReady` | < 100 ms (proposed) |
| Body re-run count | body runs per push (02) | per screen baseline |

- Gating requests end before `contentReady`. Requests that end later do not delay the screen; `waterfall.mjs` lists them apart.
- Simulator values are deltas only. Absolute targets need the device and the profile build.
- Label each run cold (first open after launch) or warm (open again).

## Common causes by segment

- First render slow: heavy destination `init`, eager `List` IDs, large body, `AnyView` tree, router fan-out on push.
- Client delay long: the load starts in `onAppear` after layout, or waits for another request.
- Critical path long: serial requests, a dependency waterfall (07).
- UI tail long: JSON decode on main, image decode on main, a large diff after the data lands.

## Action plan output

```
### Screen open (<screen>, <target>, <build>, N=<n>, cold|warm)
| Segment | p50 ms | p95 ms | Target | Status |
|---|---|---|---|---|
| First render | | | < 100 | |
| Client delay | | | < 50 | |
| Critical path | | | baseline | |
| UI tail | | | < 100 | |
| Time to content | | | < 300 / < 1000 | |
Largest segment: <name>. Next: trace that window (04) or the network (07).
```
