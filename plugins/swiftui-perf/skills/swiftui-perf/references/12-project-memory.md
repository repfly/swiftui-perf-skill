# 12. Project memory

The skill learns the project as it works. It keeps what it learns in `memoryFile` (default `.swiftui-perf-memory.json` in the project root). Commit this file, so the next session and the team start with it.

## What to record

| Kind | When | Command |
|---|---|---|
| Route | you reach a screen for the first time, or the old route did not work | `memory.mjs route <Screen> --step "..." --step "..." [--deeplink <url>] [--ready "..."]` |
| Route confirmed | a recorded route worked again | `memory.mjs confirm <Screen>` |
| Obstacle | something blocked you and you found what works | `memory.mjs obstacle --area <area> --problem "..." --fix "..." [--screen <Screen>]` |
| Fact | a stable project fact that a script or the config does not hold | `memory.mjs fact --area <area> "..."` |

Areas: `setup`, `build`, `install`, `login`, `launch`, `navigation`, `markers`, `network`, `trace`, `lldb`, `backend`, `other`.

## Rules

- **Read first.** At intake, run `memory.mjs show --screen <Screen>`. Follow the recorded route and avoid the known obstacles before you try anything new.
- **Record at once.** Record an obstacle as soon as you find the fix, not at the end of the session. A session can stop at any time.
- **Steps a new agent can repeat.** Write each route step as one action with what to look for: "Tap the Profile tab (bottom right)", "Wait until the user name shows". Use accessibility labels or visible text, not screen coordinates.
- **Problem and fix together.** An obstacle without a working fix is not useful. If you did not find a fix, write what you tried in the fix field ("not solved; tried X and Y").
- **Replace, do not pile up.** If a route changed, record the new route; it replaces the old one. Remove wrong entries with `memory.mjs remove <id | Screen>`.
- **No secrets.** Never record passwords, tokens, account names or personal data. The script refuses text that looks like a credential.
- **Not for results.** Measurements go in `findings.md` and `report.md`, not in memory.

## Examples

```
node <skill>/scripts/memory.mjs route Profile \
  --step "Launch the app and wait for the tab bar" \
  --step "Close the campaign popup if it shows (Close, top right)" \
  --step "Tap the Profile tab (bottom right)" \
  --ready "the user name label is visible"

node <skill>/scripts/memory.mjs obstacle --area build \
  --problem "Release build closes itself on the simulator after 5 s" \
  --fix "build with the security gate flag (build.sh profile does it)"
```

## Action plan output

```
### Memory (<date>)
- Read: <routes and obstacles used>
- Recorded: <new routes, obstacles, facts>
- Removed: <ids>
```
