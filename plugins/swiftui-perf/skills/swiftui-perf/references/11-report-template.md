# 11. Report template

Write `report.md` in the work folder. Use Simplified Technical English. Start with the answer.

```
# Performance report: <scope>

Date: <date>. Target: <device | sim>, <OS>, Xcode <v>. Build: <profileConfiguration> <hash>.

## Result
<one to three sentences: the main cause, the gain from kept changes, what is left>

## Metrics
| Metric | Screen | Before p50/p95 | After p50/p95 | Target | Target type |
|---|---|---|---|---|---|
| Time to content | Home | 1240 / 1610 ms | 820 / 1010 ms | < 1 s | device absolute |
| First render | Home | 180 / 230 ms | 95 / 120 ms | < 100 ms | sim delta only |

## Findings
| # | Severity | Finding | Evidence | Fix | Expected gain | Effort | Validation | Status |
|---|---|---|---|---|---|---|---|---|
| F1 | high | Router fan-out runs 34 bodies per push | printchanges.sh count, trace runs/base-3 | split sheet state out of the router | -60 ms first render | M | 05 recipe, N=10 | proposed |

Severity: high (user-visible, ≥ 100 ms or a hang), medium (10 to 100 ms, or hitches), low (< 10 ms or rare).
Effort: S (one file), M (a few files, one feature), L (shared component or store).
Status: kept (measured), proposed (trace-backed, not built), suspected (no trace yet).

## Action plan
1. <highest gain / lowest effort first>: <what>, <where>, <how to validate>
2. ...

## Decisions for the user
- <product or security decision with the measured cost, for example: TLS 1.2 pin adds <ms> per new connection>

## Method
- Recipes: <list>. Runs: <N>, <cold|warm>. Network: <real | throttled | mocks>.
- Markers: temporary; reverted (`markers.mjs status`: clean).
- Simulator numbers are relative only.
```

## Rules

- Every finding has evidence: a run ID, a trace file, a count or a field-data signature. Without evidence, the status is "suspected".
- Never restate the diff. Name the file and line of each kept change.
- Keep the report under 120 lines. Put raw tables in `runs/` and link them.
- Traces can hold request bodies in clear text. Do not attach them outside the work folder.

## Action plan output

The "Action plan" section of `report.md` is the output of this phase. Order it by expected gain divided by effort. Each item names its validation recipe.
