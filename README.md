# swiftui-perf

A skill for AI coding agents. It finds and fixes slow parts of a SwiftUI iOS app.

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

## Set up your project

Run this once in your project folder:

```bash
node <skill folder>/scripts/setup.mjs init
```

Answer the questions. Or just ask your agent to set it up.

## Use

Tell your agent what is slow. For example:

> The home screen opens slowly. Fix it.

## Needs

- macOS with Xcode
- Node.js 22 or later
- An iOS Simulator

## License

MIT
