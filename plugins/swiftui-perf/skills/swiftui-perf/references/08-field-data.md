# 08. Field data

Start with what real users feel. Field data sets the priority. Lab traces find the cause.

## Xcode MCP

If the agent has the Xcode MCP tools (`GetTopFieldPerformanceIssues`, `GetFieldPerformanceIssueLogs`), use them. Xcode must be open with the project from the config.

1. `GetTopFieldPerformanceIssues` with `diagnostic_type` set to each of `launches`, `hangs`, `diskwrites`, `energy`.
2. Note the app (`apps[].name`), the version, the share of users and the top signature.
3. `GetFieldPerformanceIssueLogs` for the top issue of each type. Read the main-thread stack.
4. Map each top frame to a file in the repo. A frame in a third-party SDK is still a finding: it says which call site to look at.

## Other sources

- Xcode Organizer › Launches, Hang Rate, Scrolling (hitch rate), Disk Writes, per app version.
- If MetricKit is not in the app, do not add it in a perf session; propose it in the report. iOS 27 adds `MetricManager` and `TimeToFirstDrawMetric`, and `MX*` availability ends at 27.3, so keep `MX*` behind `#available`.
- Firebase Performance screen traces are tied to `UIViewController` and assume 60 Hz, so their SwiftUI numbers are not reliable. Do not use them as a baseline.

## Thresholds

| Metric | Good | Warning | Critical |
|---|---|---|---|
| Hang | none ≥ 250 ms | ≥ 100 ms | ≥ 500 ms |
| Hitch ratio (Organizer scale, ms/s) | ≤ 10 | ≤ 25 | > 50 |
| Hitch ratio (XCTest scale, ms/s) | < 5 | 5 to 10 | ≥ 10 |
| Launch p50 | < 400 ms | < 1 s | ≥ 2 s |

## When there is no field data

- If the tools return nothing (new version, no access), write "no field data" and go on with the static scan. The user's symptom sets the priority.

## Action plan output

```
### Field data (<app>, <version>, <date>)
| Type | Top signature | Share | Repo location | Priority |
|---|---|---|---|---|
| hang | ... | ... | File.swift:line | P1 |
| launch | ... | | | |
Scope for this session: <screens and flows>.
Next phase: static scan (03) limited to the scope.
```
