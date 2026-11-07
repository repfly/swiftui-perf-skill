# 07. Request wait time

## Measure the session setup first (do not change it on your own)

- Find how the app builds its `URLSession` (the `network` keys in the config): delegate, `urlCache`, `requestCachePolicy`, TLS minimum and maximum, `protocolClasses`.
- No URLCache and a reload-ignoring cache policy mean no HTTP cache.
- A TLS maximum of 1.2 means no TLS 1.3 handshake.
- A debug inspector in `protocolClasses` (or `URLProtocol.registerClass`) puts every request through its `URLProtocol`. Then `URLSessionTaskMetrics` shows the inspector's timing, not the network. Measure with the inspector off (`debugTools`, profile build).
- A change to any of these is a product and security decision. Report the measured cost and ask.

## Per-request metrics

The marker patch logs one `PERF net` line per transaction. For `urlsession-delegate` it adds `urlSession(_:task:didFinishCollecting:)` in an extension of `network.delegateType`. For `alamofire` it adds `PerfNetMonitor` (`request(_:didGatherMetrics:)`) and swaps the Session init line for one with the monitor. For `other`, add the same line format by hand in the session's metrics callback, or use proxy timing only.

| Field | Formula |
|---|---|
| dns | `domainLookupEnd − domainLookupStart` |
| connect | `secureConnectionStart − connectStart` (TCP only) |
| tls | `secureConnectionEnd − secureConnectionStart` |
| ttfb | `responseStart − requestEnd` (server wait) |
| download | `responseEnd − responseStart` |
| total | `responseEnd − fetchStart` |
| reused | `isReusedConnection` |
| proto | `networkProtocolName` (h2, http/1.1, h3) |
| cache | `resourceFetchType` |

- `-` means the phase did not happen (a reused connection has no dns, connect or tls).
- Source: [URLSessionTaskTransactionMetrics](https://developer.apple.com/documentation/foundation/urlsessiontasktransactionmetrics).

## Per-screen waterfall

`waterfall.mjs runs/<run>.log` joins net lines to the open screen window and prints:

- client delay: `requested` → first request start
- gating requests: requests that start in the window and end before `contentReady`; requests that end later are listed apart
- critical path: first gating request start → last gating response end
- serial depth: the longest chain of requests where each starts after the one before ends
- duplicates: the same method and path more than once in one window; a 401 and its retry, and `network.authPaths` calls, are listed apart
- UI tail: last gating response end → `contentReady` (never negative)
- one row per request with dns, connect, tls, ttfb, download, total

## Anti-patterns

- Serial awaits of independent calls. With `async let`, start all calls before the first `await`. With Combine, use `Zip`.
- Loads again on each navigation re-entry (`onAppear` or `.task` with no guard). Use a `hasLoaded` guard or `.task(id:)`.
- Concurrent 401s that each start a token refresh. Use one shared refresh task.
- No URLCache and no ETag.
- JSON decode on the main thread (it shows in the UI tail).
- Image bursts on HTTP/1.1. Six connections per host give "blocked" time.
- Dependency waterfalls (config → user → content).
- A new `URLSession` per call (no connection reuse).

## Proxyman recipe

Use Proxyman to see the server side and to confirm the net lines. Use the read tools first.

1. `get_proxy_status`, `get_http_version_mode`. Proxyman HTTP/2 is off by default. That forces h2 to h1.1 and changes parallel timing. Match production before the run. Restore the mode after.
2. `install_ios_simulator_certificate` once per simulator, if needed. SSL proxying measures TLS to Proxyman, not to the server.
3. `clear_session`, do the run, then `get_flows` with a filter on the backend host.
4. `get_flow_timing` per flow for the server view. Compare `ttfb` with the net line.
5. Network conditions (`create_network_condition`) are random per run. Use medians over N ≥ 5.

Other proxies (Charles, mitmproxy) give the same server view. Use the read tools first and restore their settings after the run.

## Mocks: only when backend variance blocks a result

Use a mock only when the server `ttfb` varies so much that the client change cannot be seen (for example p95/p50 > 2 over N = 10).

1. Capture real responses first (for example Proxyman `save_flow_body`, `create_map_local_from_flow`). Never invent bodies.
2. Put the rules in a folder named `perf-<slug>` and enable it only for the run.
3. A mock removes server time. The result is client plus UI cost only. Write that in the report.
4. Disable the folder after the run (for example `toggle_rule_folder`).

## Request correlation

For one request across tools, use the same ID in a `Request` signpost, `task.taskDescription` and an `X-Req-Id` header. That is a code change in the network layer; do it only as a temporary marker-patch line for one session.

## Action plan output

```
### Network (<screen>, <target>, proxy: <none|name>, mocks: <off|folder>)
- Requests in window: <n> (gating <n>, late <n>); duplicates: <list>; 401 retries: <list>
- Client delay p50: <ms>; critical path p50: <ms>; serial depth: <n>
- Slowest request: <method path> ttfb <ms>, total <ms>, proto <p>, reused <0|1>
- New connections: <n> (dns+connect+tls sum <ms>)
- UI tail p50: <ms>
Next: parallelize <calls> | dedupe <call> | ask about cache/TLS with numbers.
```
