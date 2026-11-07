# swiftui-perf

A skill for AI coding agents. It finds and fixes slow parts of a SwiftUI iOS app: slow screens, slow launch, freezes, laggy scrolling and slow data loading.

## Works with

- Claude Code
- OpenAI Codex
- Cursor
- Gemini CLI
- Any agent that supports Agent Skills (`SKILL.md`)

## How it works

1. **Setup.** The agent asks you a few questions about your project (scheme, bundle ID, simulator) and saves the answers in `.swiftui-perf.json`. You do this once.
2. **Ask.** You tell the agent what is slow. It asks you to log in to the app on the simulator.
3. **Scan.** It reads your code and lists patterns that often make SwiftUI slow.
4. **Measure.** It adds temporary timers to your app and measures how long the screen takes to open. It also records which network requests the screen waits for.
5. **Trace.** It records the app with Instruments to see where the time goes, and counts how often each view redraws.
6. **Fix.** It makes one change, then measures again the same way. It keeps the change only if the numbers get better.
7. **Clean up.** It removes all the temporary code.
8. **Report.** It writes a short report: what was slow, what it fixed, how much faster it is, and what is left.

## Install

Claude Code:

```
/plugin marketplace add repfly/swiftui-perf-skill
/plugin install swiftui-perf@swiftui-perf-tools
```

Codex:

```bash
codex plugin marketplace add repfly/swiftui-perf-skill
```

Gemini CLI:

```bash
gemini skills install https://github.com/repfly/swiftui-perf-skill.git --path plugins/swiftui-perf/skills/swiftui-perf --consent
```

Cursor or any other agent:

```bash
npx skills add repfly/swiftui-perf-skill
```

## Use

Tell your agent what is slow. For example:

> The home screen opens slowly. Fix it.

The first time, the agent runs the setup for you. To run it yourself:

```bash
node <skill folder>/scripts/setup.mjs init
```

## Needs

- macOS with Xcode
- Node.js 22 or later
- An iOS Simulator

## License

MIT
