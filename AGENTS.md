# AGENTS.md

This repository publishes one agent skill, `swiftui-perf`, for several agent platforms.

## Layout

- The skill: `plugins/swiftui-perf/skills/swiftui-perf/`. Edit only this copy; every platform installs it from here.
- Manifests: `.claude-plugin/marketplace.json`, `.agents/plugins/marketplace.json`, and the three manifests in `plugins/swiftui-perf/`. Keep `name`, `version` and `description` the same in all of them.

## Rules

- Keep the skill project-agnostic. Project facts (schemes, bundle IDs, UDIDs, router types, SDK names) come from `.swiftui-perf.json`, never from the skill text or scripts.
- Scripts are Node `.mjs` with built-ins only, or bash. No Python, no npm dependencies.
- No magic strings in scripts: shared names, patterns and file names live in `scripts/lib/constants.mjs`.
- Write English in ASD-STE100 Simplified Technical English: short sentences, active voice, one term per meaning.
- `SKILL.md` stays under 500 lines; the frontmatter follows the Agent Skills specification.
- Run `bash tools/validate.sh` before each commit.
