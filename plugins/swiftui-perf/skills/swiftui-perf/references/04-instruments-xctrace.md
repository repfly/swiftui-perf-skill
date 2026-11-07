# 04. Instruments and xctrace for an agent

## Which Xcode

- Check `xcode-select -p` first, or set `targets.developerDir` in the config.
- Use one Xcode per run: `DEVELOPER_DIR=<developerDir> xcrun xctrace ...`. An older `xctrace` cannot trace a newer device OS.
- Recent Xcode versions ship an xctrace reference for agents in `IDEIntelligenceChat.framework` resources (`xctrace-ref-*.md.packaged`). Read it once if it exists.
- Always confirm flags with `xcrun xctrace help <command>`. The command surface changes between versions.

## Record

Use `record.sh`. Run it in the background.

- **`launch` (default on the simulator).** It stops stray recordings, records all processes, launches the app with `simctl launch ... -PerfMarkers YES`, waits `--seconds`, then stops. It prints the app pid. Use the pid in `summarize_trace.mjs --pid`.

```
bash <skill>/scripts/record.sh launch --out runs/<run>.trace --seconds 15
```

- `start` and `stop`: record in the background while you drive the app. Use `--all-processes` or `--attach <name|pid>` (warm state).
- `run`: record in the foreground for `--time-limit`.
- `--bundle` uses `xctrace --launch`. On the simulator with a Release build it hung: the app stayed at the splash screen and the time limit never fired. Use `launch` mode instead.
- Prefer `--instrument` over `--template`. Some Xcode versions fail export with "Document Missing Template".
- Never overwrite a trace. `record.sh` adds `--append-run` when the file exists.
- Kill stray recordings first: `pkill -INT -f 'xctrace record'`.
- Newer `xctrace` has `--recording-options <json>` (see `--show-recording-options`), for example to lower the hang threshold.

## Instruments per target

| Instrument | Simulator | Device |
|---|---|---|
| Time Profiler, CPU Profiler | relative numbers | yes |
| Hangs | yes | yes |
| os_signpost, os_log | yes | yes |
| SwiftUI | records, lanes empty | yes (iOS 26+, Release build) |
| Animation Hitches | "Not supported on this platform" | yes |
| HTTP Traffic | assume no | yes |
| Processor Trace, Power Profiler | no | iPhone 16 or later; enable in Settings › Developer |

## SwiftUI instrument (device)

- Lanes: Update Groups, Long View Body Updates (orange > 500 µs, red > 1 ms), Long Representable Updates, Other Long Updates.
- If Update Groups is empty while CPU is busy, the cost is outside SwiftUI.
- Cause & Effect graph: state change → body. Blue nodes are app code. A dimmed node means the body was skipped.
- In some Instruments 26 versions the SwiftUI instrument can empty every lane. Record a second run without SwiftUI to get the other lanes.

## Read a trace with xctrace

```
xcrun xctrace toc runs/<run>.trace
xcrun xctrace list tracks --input runs/<run>.trace --type "Process/Thread" | grep '<processName>'
xcrun xctrace show --input runs/<run>.trace --track "Time Profiler" --calltree "Profile" --time-start 2s --duration 1500ms
xcrun xctrace show --input runs/<run>.trace --track "os_signpost/<markers.subsystem>" --summary "Summary: Intervals"
xcrun xctrace triage runs/<run>.trace --style hangs --format markdown --limit 5
```

- `list`, `show` and `triage` exist only in newer `xctrace`. Copy track names exactly from `toc`.
- Use `--time-start` and `--duration` from the `ScreenOpen` signpost window, so the call tree covers only the screen open.
- Hang tiers: 33, 100, 250 (microhang), 500 (hang), 2000 ms (severe).
- Classify each hang before you read stacks. Main-thread running coverage < 25 % is blocked (I/O, lock, wait). Coverage ≥ 75 % is busy (CPU). On a loaded Mac, low CPU can be scheduling noise; record again on a quiet Mac.

## Read a trace with summarize_trace.mjs

```
node <skill>/scripts/summarize_trace.mjs runs/<run>.trace --pid <pid> --top 25 > runs/<run>.json
```

- Filter by `--pid`. A name filter often matches nothing in all-processes mode, because the trace shows the executable name, not the display name. If the filter matches nothing, the JSON lists `processesSeen`.
- `topAppFrameMain` attributes each main-thread sample to the first frame in the app binary. Read it first; it names the app call site behind system time.
- `markerIntervals` lists the `ScreenOpen` intervals of `markers.subsystem`.
- `--window <startMs>:<endMs>` limits samples to a signpost window. `--log-out <file>` writes PERF lines from the `os-log` table for `waterfall.mjs`.
- `xctrace triage` needs both Hangs and Time Profiler in the recording. `record.sh` records both by default.
- A trace of a Debug build shows `__debug_main_executable_dylib_entry_point`. Do not report numbers from such a trace.
- Never read raw export XML into the context. A 5 s trace is about 33k lines.

## Export by hand

- Schemas: `time-profile` (fallback `time-sample`), `cpu-profile`, `potential-hangs`, `hang-risks`, `os-signpost`, `os-log`, `hitches`, `swiftui-updates`, `swiftui-update-groups`, `http-transaction`, `swift-task`. Confirm with `--toc`.
- `xctrace export --input <t> --xpath '/trace-toc/run[@number="1"]/data/table[@schema="time-profile"]'`.
- The XML de-duplicates with `id` and `ref`, so keep a global id map. `<sentinel/>` means no value. Drop durations close to UINT64_MAX.
- HTTP Traffic: `xctrace export --input <t> --har`. Traces hold bodies in clear text; never commit or share them.

## Gotchas

- Some templates return empty data with no error (Leaks with `--attach`).
- Large unsymbolicated exports can crash. Symbolicate Release builds with `xctrace symbolicate --dsym <path>`.
- Third-party SDK loggers can bypass os_log; do not expect their lines in `os-log`.

## Action plan output

```
### Trace evidence (<run>, <target>, <build>, pid <pid>)
- Window: <signpost or time range>
- Main thread top self: <symbol> <ms> (<%>); top app frame: <symbol>
- Hangs: <count> ≥250 ms, <count> ≥100 ms; classification: <busy | blocked>
- SwiftUI (device): <n> red, <n> orange updates; top view: <View>
- Suspects confirmed: <S#>; ruled out: <S#>
Next phase: fix loop (10) on the confirmed suspect with the largest share.
```
