# 02. Hidden debug hooks and LLDB

These hooks are for debug builds only. Never commit them in app code. If `rules.privateHooksNeedOk` is true, ask the user before you use a private hook. Prefer the LLDB route, because it needs no code edit.

## Hook table

| Hook | Kind | Min OS | Use |
|---|---|---|---|
| `let _ = Self._printChanges()` in `body` | underscored | 15 | Prints why the body ran: `@self`, `@identity`, `_prop changed` |
| `Self._logChanges()` | underscored | 17.1 | Same reason, to os_log subsystem `com.apple.SwiftUI`, category "Changed Body Properties" |
| LLDB breakpoint in `body` with action `expression Self._printChanges()` | debugger | 15 | Same output, no code edit (`printchanges.sh`) |
| `SWIFTUI_PRINT_TREE=1` env | private | unverified | Prints the display list on each update |
| `AG_TRAP_CYCLES=1` env + breakpoint `AG::Graph::print_cycle` | private | unverified | Stops on "AttributeGraph: cycle detected" |
| `recursiveDescription`, `_printHierarchy`, `_autolayoutTrace` | UIKit private | any | Shows hosting controller structure |
| `CA_DEBUG_TRANSACTIONS=1`, `CA_ASSERT_MAIN_THREAD_TRANSACTIONS=1` | CA env | any | Finds layer changes off the main thread (Combine sinks with no `.receive(on:)`) |
| Debug random background colour modifier | technique | any | Shows re-renders on screen |

- Simulator only, build-specific: `AGGraphGetValue` breakpoint plus `AG::Graph::print()` by offset, and [AGDebugKit](https://github.com/OpenSwiftUIProject/AGDebugKit). Use them only when all other routes fail.
- Not real: `AG_DEBUG_SERVER` env, `AGGraphDescription`. Unverified: `-LogForEachSlowPath YES`.
- `_printChanges` is best effort. `@self` means the view value changed, but it does not say which field.

## Recipe: count body runs with no code edit

1. Set `printChanges.initFile` and `printChanges.initLine` in the config: a line that runs once at app start (for example the first line of the App `init`).
2. Build the debug configuration and install it: `build.sh debug`, then `xcrun simctl install <udid> <app path>`. Do one launch after the install; the first launch under LLDB loads symbols for 40 s or more.
3. Run in the background:

```
bash <skill>/scripts/printchanges.sh --out <workDir>/perf-<slug>/runs/pc-1 --view HomeView --view RootView \
  --mark HomeViewModel.swift:43:vminit --seconds 45
```

4. Do the interaction once in the window (one push, one tap, one keystroke).
5. The script prints `<count> BODY <View>` and `<count> MARK <label>`. Read the reasons in `stdout.txt` after each `BODY` line.
6. Write the counts and the reasons into `findings.md`.

Why the script works this way:

- `simctl launch -w --stdout=<path>` alone wrote nothing. The breakpoint at `initFile:initLine` calls `freopen` on stdout into the app data container `tmp/`. The simulator cannot write outside its container.
- Each breakpoint hit adds about 100 ms. Body counts and reasons are valid. Times from such a run are not; never report them.

## Recipe: `_logChanges` on iOS 17.1+ simulators

```
xcrun simctl spawn <udid> log stream --level info --style compact \
  --predicate 'subsystem == "com.apple.SwiftUI" AND category == "Changed Body Properties"'
```

This needs `let _ = Self._logChanges()` in the body. That is a code edit: add it as one separate line, and remove it before the next run.

## Recipe: main-thread stacks during a hang

1. While the app hangs, pause it in LLDB (`process interrupt`).
2. Run `bt all`.
3. Find the main thread (thread 1). Classify it:
   - busy: frames in app code, JSON decode, layout, image decode
   - blocked: `semaphore_wait`, `__psynch_mutexwait`, `mach_msg`, `dispatch_sync`
4. Run `process continue`.

## Recipe: view hierarchy

```
expression -l objc -O -- [[[UIApplication sharedApplication] keyWindow] recursiveDescription]
expression -l objc -O -- [[[[UIApplication sharedApplication] keyWindow] rootViewController] _printHierarchy]
```

Use this to count nested hosting controllers inside navigation containers.

## Recipe: environment variables

```
SIMCTL_CHILD_CA_ASSERT_MAIN_THREAD_TRANSACTIONS=1 xcrun simctl launch --console-pty <udid> <bundleId>
```

## Action plan output

```
### Debug hook evidence
- <View>: <n> body runs per <interaction>; reasons: <@self | _prop changed | @identity>
- Hang at <time>: <busy | blocked>; top app frame: <symbol>
- Hooks used: <list>; user OK for private hooks: <yes | not needed>
Next phase: fix loop (10) for the views with the highest counts.
```
