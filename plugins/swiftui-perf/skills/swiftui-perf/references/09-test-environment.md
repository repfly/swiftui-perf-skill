# 09. Test environment

## One simulator, serial work

- Use one simulator, pinned by UDID: `targets.simulatorUdid`, the one the user is signed in to. Confirm it with `xcrun simctl list devices booted`.
- Use `-destination 'id=<UDID>'`. A `name=` destination can fail to resolve, and a generic simulator destination can fail on arm64-only binary frameworks.
- Never boot a second simulator. Never run two `xcodebuild`, `xctrace` or `simctl launch` jobs at the same time.
- Run builds and traces in the background. Wait for each to finish before you install, launch or trace.
- Match the backend the simulator is signed in to.

## Login first

Before the first run on a target, ask the user:

> Log in to the app on <simulator name / device>, open the start screen, and reply "done".

- Never type credentials. Never put tokens in launch arguments or in files.
- The simulator keychain survives a reinstall, so one login usually covers the session.
- Optional golden simulator: after the login, `xcrun simctl clone <udid> "perf-golden"` keeps a signed-in copy. Ask first; it uses disk space and is a second device.

## Device

- `targets.deviceUdid`. The Xcode in `targets.developerDir` must support its OS.
- Before a device run, ask the user to:
  1. connect the device by cable and unlock it
  2. confirm Developer Mode is on
  3. log in to the app on the device and reply "done"
  4. for Power Profiler runs, disconnect the charger
  5. for Processor Trace, enable it in Settings › Developer
- Check: `xcrun xctrace list devices` must list it under "Devices", not "Devices Offline".
- Use the project's development signing. Do not change signing settings.

## Build for profiling

```
bash <skill>/scripts/build.sh profile            # profile configuration, gates off by flag
bash <skill>/scripts/build.sh debug              # only for printchanges.sh and LLDB
```

- `build.sh` quotes the configuration name. An unknown name does not fail; xcodebuild silently uses another configuration.
- Security gates: `build.sh profile` adds `SWIFT_ACTIVE_COMPILATION_CONDITIONS=$(inherited) <flags>` from `securityGates`. Without it a Release build can close or block itself on the simulator.
- Install: `xcrun simctl install <udid> <app path>`. On the device: `xcrun devicectl device install app --device <udid> <app path>`.
- Debug network inspectors: the marker patch skips their start line when `-PerfMarkers YES` is set. Without the patch they start; write that in the run label (`runlog.mjs ... inspector=on`).
- Thread Performance Checker is a scheme diagnostic for Run only. Command-line launches do not use it.

## Launch and navigate

- Launch: `xcrun simctl launch --terminate-running-process <udid> <bundleId> -PerfMarkers YES`.
- `simctl launch -w --stdout` can write nothing; for stdout use `printchanges.sh` (02).
- Deep link: `xcrun simctl openurl <udid> '<scheme>://<path>'`.
- Taps: use the agent's simulator tool (tap, swipe, screenshot). Take a screenshot before you tap by coordinate.
- For N runs, use the same path every time: same start screen, same taps, same wait.
- Use the recorded route from `memory.mjs show --screen <Screen>`. Record a new route when you find one (12).

## Network conditions

- Default: the real backend, no throttling.
- Throttling: a proxy network condition. Reset it after the run.
- Mocks only when backend variance blocks a result (07). Capture real responses first. Disable the mock rules after the run.

## Clean up

- `pkill -INT -f 'xctrace record'` if a recording is still running.
- Stop the background `log stream`.
- `markers.mjs revert`, then `markers.mjs status` must say "clean".
- Disable mock rules and network conditions; restore proxy settings.

## Action plan output

```
### Environment (<date>)
- Target: <sim name + UDID | device UDID>, OS <v>, Xcode <v>
- Build: <profileConfiguration> <sha>, markers <on|off>, inspectors <off|on>, gate flags <list>
- Login confirmed by user: <yes, time>
- Network: <real | throttled profile | mocks folder>
- Run order: <list of runs>, serial
```
