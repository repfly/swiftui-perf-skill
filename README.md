# swiftui-perf skill

An agent skill that finds and fixes SwiftUI iOS performance problems: slow screen opens, slow launch, hangs, scroll hitches, extra body re-runs and long request waits. It works in any SwiftUI project after a one-time setup.

## What it does

The agent follows a phase router (`SKILL.md`):

0. **Setup.** An interactive setup writes `.swiftui-perf.json`: schemes, configurations, bundle IDs, simulator and device, navigation anchors, network layer, debug tools to turn off, security gates and their disable flags, deployment floor, project rules.
1. **Intake** of the symptom, the screen and the target.
2. **Field data** from Xcode Organizer or the Xcode MCP tools.
3. **Static smell scan** (`smell_scan.sh`) for known SwiftUI cost patterns.
4. **Instrumented run.** A temporary marker patch logs screen open times (OSSignposter + os_log) and per-request `URLSessionTaskMetrics`. `waterfall.mjs` turns the log into a per-screen table.
5. **Trace analysis.** `record.sh` drives `xctrace` (Time Profiler, Hangs, os_signpost). `summarize_trace.mjs` makes short JSON. `printchanges.sh` counts body runs with `Self._printChanges()` through LLDB, with no code edit.
6. **Fix loop.** One variable per run, before and after from the same recipe, keep or revert by the noise floor. `runlog.mjs diff` blocks A/B pairs that change more than one variable.
7. **Report** with evidence for every finding.

Rules the skill enforces: measure before and after; one change per run; simulator numbers are relative only; a Release-like profile build; markers are temporary and revert clean; private SwiftUI hooks only through LLDB.

## Requirements

- macOS with Xcode 16 or later (`xcrun xctrace`, `simctl`, LLDB).
- Node.js 22 or later. The scripts use only Node built-ins (no npm install).
- A booted iOS Simulator the user is signed in to. A device for absolute numbers.

## Install

Replace `<owner>` with the GitHub owner of this repository. The skill folder is `plugins/swiftui-perf/skills/swiftui-perf/`.

### Claude Code (plugin marketplace)

In a Claude Code session:

```
/plugin marketplace add <owner>/swiftui-perf-skill
/plugin install swiftui-perf@swiftui-perf-tools
```

From a shell:

```bash
claude plugin marketplace add <owner>/swiftui-perf-skill
```

```bash
claude plugin install swiftui-perf@swiftui-perf-tools
```

A local clone works too: `claude plugin marketplace add ./swiftui-perf-skill`. Without the plugin system, copy the skill folder to `~/.claude/skills/swiftui-perf/` (all projects) or `.claude/skills/swiftui-perf/` (one project).

### OpenAI Codex

Codex reads skills from `.agents/skills/` in the repository and from `~/.agents/skills/`. Copy or symlink the skill folder there:

```bash
mkdir -p ~/.agents/skills && cp -R plugins/swiftui-perf/skills/swiftui-perf ~/.agents/skills/
```

As a Codex plugin marketplace (reads `.agents/plugins/marketplace.json`):

```bash
codex plugin marketplace add <owner>/swiftui-perf-skill
```

The skill ships `agents/openai.yaml` for its display name and default prompt.

### Cursor

Cursor loads skills from `.cursor/skills/`, `.agents/skills/` and `~/.cursor/skills/` (and `.claude/skills/`). Copy the skill folder to one of them:

```bash
mkdir -p ~/.cursor/skills && cp -R plugins/swiftui-perf/skills/swiftui-perf ~/.cursor/skills/
```

Optional rule: copy `platforms/cursor/swiftui-perf.mdc` to `.cursor/rules/`. The plugin folder also has `.cursor-plugin/plugin.json`.

### Gemini CLI

```bash
gemini skills install https://github.com/<owner>/swiftui-perf-skill.git --path plugins/swiftui-perf/skills/swiftui-perf --scope user --consent
```

Or copy the skill folder to `~/.gemini/skills/` or `.gemini/skills/`. Note: Google replaced Gemini CLI with Antigravity CLI for some account types in June 2026.

### Any Agent Skills client

The skill follows the [Agent Skills specification](https://agentskills.io/specification). The cross-agent installer [skills](https://github.com/vercel-labs/skills) installs it for many agents:

```bash
npx skills add <owner>/swiftui-perf-skill --skill swiftui-perf -a claude-code -a codex -a cursor
```

## Setup in your project

Run once in the project root, then commit `.swiftui-perf.json` and gitignore the work folder:

```bash
node <skill>/scripts/setup.mjs init
```

```bash
node <skill>/scripts/setup.mjs check
```

The agent can also do it: it runs `setup.mjs detect`, asks you the `setup.mjs questions` in chat, and writes the answers with `setup.mjs write --answers <file>`. `check` confirms each anchor line occurs once, each security flag exists in code, and the network hook has no conflict.

## Use

Ask the agent, for example: "The order detail screen opens slowly. Profile it." The skill asks you to log in on the simulator, then measures, traces, fixes one thing at a time, and writes `report.md` in the work folder.

## Repository layout

```
.claude-plugin/marketplace.json        Claude Code marketplace
.agents/plugins/marketplace.json       Codex marketplace
plugins/swiftui-perf/                  the plugin
  .claude-plugin/plugin.json           Claude Code manifest
  .cursor-plugin/plugin.json           Cursor manifest
  plugin.json                          portable Agent Plugin manifest
  skills/swiftui-perf/                 the skill (SKILL.md, references/, scripts/, agents/openai.yaml)
platforms/cursor/swiftui-perf.mdc      optional Cursor rule
tools/validate.sh                      checks before a commit
```

## Validate

```bash
bash tools/validate.sh
```

It runs `bash -n` on shell scripts, `node --check` on `.mjs` files, parses all JSON, checks marketplace, plugin and `SKILL.md` fields, and runs `claude plugin validate` when the `claude` CLI exists.

## License

See `LICENSE`. The license is not chosen yet.
