---
name: swiftui-perf
description: SwiftUI iOS app performance deep dive. Finds and fixes slow screen opens, slow launch, hangs, scroll hitches, extra body re-runs and long request waits. Uses a project config made by an interactive setup, a static smell scan, temporary OSSignposter screen markers, URLSessionTaskMetrics, Instruments and xctrace driven by the agent, Xcode field data and LLDB-only SwiftUI debug hooks. Use when the user says the app or a screen is slow, laggy, janky, hangs, freezes, stutters on scroll, launches slowly or waits too long for data, or asks to profile, measure, trace, benchmark or optimize performance. Triggers: "this screen opens slowly", "profile the home screen", "why is scrolling janky", "launch time", "hang", "Instruments", "xctrace", "time profiler", "perf audit".
license: MIT
compatibility: macOS with Xcode 16 or later (xctrace, simctl, LLDB), Node.js 22 or later, an iOS Simulator; a device for absolute numbers.
metadata:
  version: "1.0.0"
---

# SwiftUI app performance deep dive

Measure first, change one thing, measure again. Every claim in the report has a number or a trace behind it, or it is marked "suspected".

`<skill>` is the folder that holds this file. Run scripts from the project root: `node <skill>/scripts/<name>.mjs` or `bash <skill>/scripts/<name>.sh`. Every script reads `.swiftui-perf.json` (found upward from the current folder, or `SWIFTUI_PERF_CONFIG`).

## Non-negotiables

1. **Config first.** If `.swiftui-perf.json` does not exist, do phase 0. Never guess a scheme, bundle ID, configuration name or UDID.
2. **Measure before and after.** No fix without a baseline from the same capture recipe (`references/10-experiment-protocol.md`).
3. **One variable per run.** Change one thing between A and B: one code change, or one build flag, or one tool toggle. `runlog.mjs diff` must say "one variable changed". Two changes in one run give a misleading delta; split them into separate A/B pairs.
4. **Simulator numbers are relative only.** Use the simulator for A/B deltas on the same Mac. Absolute budgets come from a device and the profile build.
5. **One simulator, by UDID, serial work.** Never run two builds, tests or traces at the same time. Never boot a second simulator. Kill stray `xctrace` processes before a new recording.
6. **Long jobs in the background.** Run builds, traces and multi-launch captures in the background and wait for their completion notice. Do not block the session on a foreground wait.
7. **Ask the user to log in first.** Before the first run on a target, ask the user to log in to the app on it and to reply "done". Never type credentials. Never put tokens in launch arguments.
8. **Markers are temporary.** Apply with `markers.mjs apply`. Revert with `markers.mjs revert` before any commit; `markers.mjs status` must say "clean".
9. **Private and underscored hooks stay out of app code.** Use them only through LLDB, environment variables or the marker patch, and only in debug builds. If `rules.privateHooksNeedOk` is true, ask the user first.
10. **Profile build for numbers.** Use `build.sh profile`: the Release-like configuration, security gates off by compile flag, debug network inspectors not started. Debug numbers are only for `_printChanges` counts.
11. **Project rules apply.** Read the files in `rules.codeRules` before a fix. Use only APIs available at `deploymentTarget`.
12. **Each reference ends with "Action plan output".** Write that block into the findings log when the phase ends.

## Phase router

| # | Phase | Read | Output |
|---|---|---|---|
| 0 | Setup | `references/00-setup.md` | `.swiftui-perf.json`, `setup.mjs check` says "config ok" |
| 1 | Intake | this file, `references/09-test-environment.md` | symptom, screen, target, login confirmed |
| 2 | Field data | `references/08-field-data.md` | top real-user launch, hang and disk-write issues |
| 3 | Static scan | `references/03-code-smells.md`, `references/01-rendering-internals.md` | suspects list from `smell_scan.sh` |
| 4 | Instrumented run | `references/05-screen-open-metrics.md`, `references/06-launch.md`, `references/07-network-wait.md` | baseline PERF lines and a trace |
| 5 | Trace analysis | `references/04-instruments-xctrace.md`, `references/02-hidden-apis-and-lldb.md` | evidence per suspect (trace-backed or ruled out) |
| 6 | Fix loop | `references/10-experiment-protocol.md` | kept and reverted changes with deltas |
| 7 | Report | `references/11-report-template.md` | `report.md` with findings and the action plan |

Skip a phase only when the intake says it does not apply. Write the reason in the findings log.

## Work folder

Write all output into `<workDir>/perf-<slug>/` (`workDir` from the config, gitignored):

```
findings.md        findings log, one block per phase
smells.md          smell_scan.sh output
runs/<run>.log     PERF log lines per run
runs/<run>.trace   xctrace recordings (never overwrite)
runs/<run>.meta.json  runlog.mjs variables per run
runs/<run>.json    summarize_trace.mjs output
waterfall.md       waterfall.mjs output
report.md          final report
```

## Tool choice

| Question | Tool | Target |
|---|---|---|
| What do real users feel most? | Xcode field data (08) | field |
| Which code patterns are suspect? | `smell_scan.sh` | repo |
| How long does a screen take to open? | marker patch + `log stream` + `waterfall.mjs` | sim (delta), device (absolute) |
| Where does main-thread CPU go? | `record.sh launch` + `summarize_trace.mjs --pid` | sim or device |
| Is there a hang, busy or blocked? | Hangs + Time Profiler, `xctrace triage --style hangs` | sim or device |
| Which body runs too often? | `printchanges.sh` (LLDB, debug build) | sim |
| Which body runs too long? | SwiftUI instrument | device |
| Scroll hitches | Animation Hitches, `XCTHitchMetric` | device |
| Request wait, DNS, TLS, TTFB | PERF net lines, proxy timing | sim or device |
| Cold launch | App Launch template, `XCTApplicationLaunchMetric` | device |

## Scripts

- `setup.mjs questions | detect | init | write --answers <file> | check`: the project config.
- `build.sh profile|debug [--app <name>] [--device]`: builds from the config and prints the `.app` path.
- `markers.mjs apply [--launch] | revert | status`: the temporary marker patch (`references/marker-patch/`).
- `record.sh launch|start|stop|run`: `xctrace record` in the background. `launch` is the safe default on the simulator.
- `summarize_trace.mjs <trace> --pid <pid>`: trace to short JSON (top functions, hangs, signposts, PERF log lines).
- `waterfall.mjs <log>`: PERF lines to a per-screen open-time and request table.
- `runlog.mjs new|diff|show`: run variables; `diff` enforces one variable per A/B.
- `smell_scan.sh [path]`: the grep catalogue from `references/03-code-smells.md`.
- `printchanges.sh --out <dir> --view <View>`: body counts and reasons through LLDB.
- `config.mjs get <key>`: one config value, for shell use.

## Perf tests

`references/perf-test-template.md` holds an XCUITest perf template. Use it only if `rules.testException` allows `XCTestCase` perf tests, or after the user approves it. Create a target in Xcode, not by hand in `project.pbxproj`.

## Done

- `report.md` exists and follows `references/11-report-template.md`.
- Each kept change has a before and after number from the same recipe, and `runlog.mjs diff` says one variable changed.
- `markers.mjs status` says "clean", and no perf code is in `git diff`.
- Mock rules, network conditions and stray `xctrace` recordings are off.
