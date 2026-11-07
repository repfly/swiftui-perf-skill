# 00. Setup

The skill reads one project config: `.swiftui-perf.json` in the project root. Commit it, so the team shares one setup. Keep `workDir` gitignored.

## Two ways to make the config

- **The user runs it.** `node <skill>/scripts/setup.mjs init` asks each question in the terminal. It shows what it detected as the default.
- **The agent runs it.** Run `setup.mjs detect` and `setup.mjs questions`. Ask the user the questions in chat, with the detected values as proposals. Write the answers to a JSON file in the scratchpad. Run `setup.mjs write --answers <file>`.

Then run `setup.mjs check`. Fix each "problem" line before phase 1.

## What the config holds

| Key | Meaning |
|---|---|
| `project.workspace` or `project.project` | the `.xcworkspace` or `.xcodeproj` path |
| `apps[]` | `name`, `scheme`, `bundleId`, `processName` (the executable name in traces), `entryFile`, `sourceDirs` |
| `build.profileConfiguration`, `build.debugConfiguration` | exact configuration names; xcodebuild silently falls back to another configuration for an unknown name |
| `build.profileBuildSettings` | extra `KEY=VALUE` build settings for the profile build |
| `targets.simulatorUdid`, `targets.deviceUdid`, `targets.developerDir` | the one simulator, the device, the Xcode to use |
| `markers.subsystem` | os_log subsystem for PERF lines and signposts |
| `markers.appMarkerDir` | folder in the app target for `PerfMarkers.swift` |
| `markers.navigation[]` | `file`, exact `anchor` line, `call` to insert on the next line |
| `markers.launch` | `file`, `anchor`, `name` for a root screen opened at launch (`markers.mjs apply --launch`) |
| `network.type` | `urlsession-delegate`, `alamofire` or `other` |
| `network.delegateType`, `delegateAccess`, `metricsDir` | URLSession delegate to extend; `public` if it is in a framework |
| `network.monitorRegistration` | Alamofire: the Session init `line` and the `with` line that adds `eventMonitors: [PerfNetMonitor()]` |
| `network.authPaths` | token refresh path patterns; `waterfall.mjs` does not count them as duplicates |
| `debugTools[]` | debug-only tools to skip at launch while profiling: `name`, `file`, exact start `line` |
| `securityGates[]` | Release gates that block the simulator or a debugger: `name`, compile `flag` that disables it, `where` |
| `deploymentTarget` | the iOS floor; fixes use only APIs available there |
| `smellScan.paths`, `smellScan.exclude` | folders for `smell_scan.sh` |
| `rules.codeRules`, `rules.testException`, `rules.privateHooksNeedOk` | project rules the fix loop follows |
| `memoryFile` | the project memory file (12); commit it |
| `printChanges.initFile`, `printChanges.initLine` | a line that runs once at app start, for the LLDB stdout redirect |

## Questions that need care

- **Security gates.** Release builds can stop on the simulator because of jailbreak, anti-debug or tamper checks (for example a timer that closes the app after 5 s). Ask for each gate and the compile flag that turns it off. `build.sh profile` passes the flags as `SWIFT_ACTIVE_COMPILATION_CONDITIONS=$(inherited) <flags>` on the command line. No file changes. If a gate has no flag, stop and ask the user how to profile; do not edit the gate.
- **Debug network inspectors** (netfox, Pulse, Atlantis, a custom `URLProtocol`). They cost time at launch (0.8 to 3 s was seen) and their `URLProtocol` hides `URLSessionTaskMetrics` timing. The marker patch wraps their start line so they do not start when `-PerfMarkers YES` is set. It does not start and then stop them. Revert restores the line.
- **Root screens.** A tab root or the first screen has no navigate call. Give a launch anchor, so `apply --launch` inserts `begin("<name>")` at app init.
- **Anchors.** Each anchor must be one exact line that occurs once in its file. `check` counts them.
- **New files.** If the target does not use synchronized folders, the user must add the patch files to the target in Xcode for the session.

## Action plan output

```
### Setup (<date>)
- Config: .swiftui-perf.json, check: config ok
- Apps: <name scheme bundle>; profile configuration: <name>
- Target: <sim UDID>; device: <UDID | none>
- Network hook: <type>; inspectors off: <list>; gates off by flag: <list>
```
