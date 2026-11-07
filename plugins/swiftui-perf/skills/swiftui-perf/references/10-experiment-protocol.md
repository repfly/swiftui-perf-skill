# 10. Experiment protocol

## Loop

1. **Baseline.** Run the capture recipe N times on the unchanged code. Save the runs under `runs/base-*`. Record the variables: `runlog.mjs new runs/base-1 build=profile target=sim temperature=cold network=real`.
2. **Hypothesis.** Write one sentence: "<change> reduces <metric> on <screen> because <mechanism>".
3. **Change.** Make one reversible change. Keep it small. Build.
4. **Measure.** Run the same recipe N times. Save under `runs/h<k>-*` with the same variables plus one (`change=h<k>`). Run `runlog.mjs diff runs/base-1 runs/h<k>-1`; it must say "one variable changed".
5. **Decide.** Keep or revert with the rules below.
6. **Re-plan.** Update the suspects list. Go to step 2, or stop when the target is met or the budget is spent.

## Run counts and order

- N ≥ 5 for traces, N ≥ 10 for marker timings on the simulator.
- Interleave A and B when you can (A, B, A, B), so drift hits both equally. With one simulator and one install per build, run all A, then all B, then 3 more A to check drift.
- Discard the first run after an install (cold caches).
- Label each run cold or warm. Never mix them in one statistic.
- Use a known-good sibling screen as the control. If the control moves too, the change is noise.

## Statistics

Report per metric: median (p50), p95, standard deviation, N.

- Use the median for the decision, not the mean.
- Delta = median(B) − median(A). Relative delta = delta / median(A).
- Noise floor = the larger of 2 × stddev(A) / √N and the control screen's change.

## One variable per A/B

- A build flag, a tool toggle (for example a network inspector on or off) and a code change are each one variable.
- Two variables in one A/B make the delta unreadable. Example: an inspector off and a security flag on in the same run hid which one saved the time.
- To isolate two effects, run A, A+x, A+y. Never only A and A+x+y.

## Keep or revert

| Result | Decision |
|---|---|
| Delta is better than the noise floor and ≥ 5 % | keep |
| Delta is inside the noise floor | revert; write "no measurable effect" |
| Delta is worse | revert |
| Better on the simulator, not yet checked on the device | keep as "sim delta only"; check on the device before the report calls it a win |

- Re-record on a quiet Mac when the data shows scheduling noise (high stddev, the control moves).
- A change that only helps in DEBUG does not count.

## Fix rules

- Follow the files in `rules.codeRules`. Use only APIs available at `deploymentTarget`. Reuse existing components.
- Do not add `[weak self]` everywhere. Change capture lists only where a trace or a leak shows the problem.
- No product changes (SDK deferral, cache policy, TLS settings, UI behaviour) without the user's OK. Report the measured cost and ask.
- Keep the marker patch lines separate from fix lines, so `markers.mjs revert` leaves only the fix.

## Findings log

Write one block per experiment into `findings.md`:

```
### H<k>: <hypothesis>
- Change: <file:line, one line>
- Recipe: <capture>, N=<n>, <cold|warm>, <target>, <build hash>
- A: p50 <ms>, p95 <ms>, sd <ms>
- B: p50 <ms>, p95 <ms>, sd <ms>
- Control: <screen> moved <ms>
- Decision: keep | revert | sim delta only
```

## Action plan output

```
### Experiments summary
| H | Change | Metric | A p50 | B p50 | Delta | Decision |
|---|---|---|---|---|---|---|
Kept changes: <list>. Reverted: <list>. Open hypotheses: <list>.
Next phase: report (11).
```
