# Phase 4 / B5 implementation results

Authorized scope: scheduler, transient presence, and HTTP SSE on the existing
B4 adapter. No engine semantics, SQL migration, dependency, frozen contract or
frontend changes. Existing user planning/design edits were preserved. No agents
were delegated. Backend completion does not establish browser/UI readiness.

## Acceptance evidence

| IDs | Actual evidence |
| --- | --- |
| E01–E08, P01–P06, B01–B05, engine L01–L04 | All 42 selected engine regressions passed before implementation; retained in the full suite. |
| S01 | Actual Node HTTP client parses ready/snapshot/update framing and IDs. A deterministic read interception commits once before snapshot capture and once afterward: the duplicate drops, the newer revision survives. |
| S02/A02 | Ordered committed updates over HTTP SSE; failed tick history trigger rolls back snapshot/queue/revision and emits scheduler.error only. Prior B4 independent-connection commit assertions remain green. |
| S03 | One-shot loop identity prevents stale callbacks ticking a later Play generation. Pause during post-commit tick publication follows that tick and prevents the next one; End and stale callbacks preserve tick/queue. Synchronous SQLite actions serialize HTTP/timers between ticks. |
| S04 | Registration and valid renewal each grant 15000ms. Renewal at 5s creates no revision/history. Tests cover queued stale expiry and early timer rearming. Sending heartbeats every 5s belongs to the future browser. |
| S05 | Two leases, one remaining lease, closed-stream grace, last expiry with persisted PAUSE/NO_CLIENTS, and overdue tick presence recheck. Failed auto-pause stops scheduling and reports error without fabricating saved Paused state or retrying. |
| S06 | Reconnect within grace preserves playback; after auto-pause requires Play. Actual HTTP Play/tick/application restart persists SERVER_RESTART Pause and serves null interval, preserving tick. Browser refresh behavior remains unimplemented. |
| S07/L05 | Closed/expired/unknown/wrong-world IDs cannot renew. Cancel closes both draft streams and invalidates leases; subsequent SSE/presence reads return JSON 404. Shutdown with an open stream completes and clears application timers. Stalled writer frame/byte limits and thrown-write cleanup tested deterministically. |
| S08/A03 | Lost delivery leaves committed Step successful. Reconnect ignores Last-Event-ID and supplies current snapshot; bounded history query recovers the missed committed entry. Writer failure cannot undo state. Browser cursor/deduplication behavior remains unimplemented. |
| S09 | HTTP/SSE running interval becomes the Play interval, repeated Play preserves it, Pause/End/auto-pause/restart/error expose null. No scheduler metadata is stored in snapshot JSON or creates independent revisions. |
| S10 | Tick history failure preserves saved Playing state and commands; repeated Play remains a no-op with null interval. Failed Pause changes nothing. Successful Pause clears error, then Play schedules again; End clears stopped error too. Real SQLite writer lock yields PERSISTENCE_UNAVAILABLE; injected unexpected failure yields INTERNAL_ERROR. Reconnect receives current stopped error. |
| A01/L02 | HTTP Play now requires a current open live subscription and uses server scheduling; manual Step remains Paused-only and lease-independent. Existing lifecycle/error tests remain green. |

No known failing B5 tests. S01–S10 backend portions are implemented. Remaining:
**U01–U08**, UI portions of **L01–L05**, and browser portions of **S04/S06/S07/S08**
(5s heartbeat, refresh/reconnect wiring, teardown, deduplication/cursor handling).
No complete application, frontend, module C or module D claim.

## Actual TDD and validation

Node 26.13.0 via `/tmp/node-v26.13.0-linux-x64/bin` on PATH. Jest executes built
strict TypeScript as ESM. Temporary file SQLite is real; no database/framework
mocks. The clock is injected only in the application layer.

| Command/check | Actual result |
| --- | --- |
| `npm run test:engine -- --reporter=dot` | 42 passed before edits |
| API build + native-ESM Jest `apps/api/test/playback.test.mjs` against explicit stub | Red: 4 failed |
| Same build/Jest after scheduler and presence implementation | Green: 4 passed |
| Playback + persistence after lease-constant refactor | 29 passed; typecheck and diff check passed |
| Native-ESM Jest `apps/api/test/streaming.test.mjs` before route implementation | Sandbox listen EPERM; escalated run red: 4 tests received no SSE frames |
| Same real HTTP suite after implementation | Green: 4 passed |
| Queued-expiry callback test | Red: 1 failed/4 passed, then green after deadline check |
| Early-expiry callback test | Red: 1 failed/8 passed, then green after generation token/rearm fix |
| `npm run test:playback` before the final early-expiry test | 16 passed after sandbox EPERM escalation; engine/API builds passed |
| Final `npm test` | All builds passed; 108 Vitest + 69 Jest = 177 tests passed |
| Final `npm run typecheck` and `git diff --check` | Passed |
| `npm run scenario -- scenarios/goto-charger.txt` | Engine/CLI built; printed the six expected lines below |

```text
R1 2,1,EAST
R1 97
R1 2,0,SOUTH
R1 100
R1 2,0,EAST
R1 100
```

Other audits passed on introduction; no red claim: writer backpressure/bounds,
SQLite busy failure, failed automatic Pause, overdue presence check, actual
Play/restart, active-stream shutdown, lost-delivery history catch-up. After green,
refactors extracted the shared test clock and removed duplicate stream exception
cleanup. No new dependency install, clean reinstall or audit was performed.
Existing Jest VM Modules/localStorage warnings remain. HTTP/process checks need
escalation in this sandbox. No performance, browser, network saturation, physical
power-loss or coverage measurements are claimed. Prior reported dependency audit
findings were not remediated in B5.

## Setup, protocol and exported seams

No new migration/setup beyond B3/B4. Preserve migrations beside dist. After the
existing Node pin and `npm ci` setup:

```sh
DATABASE_PATH=/tmp/fleet-floor.sqlite PORT=3000 npm run start:api
npm run test:playback
```

Keep an SSE connection open before new Play:

```sh
curl -N http://127.0.0.1:3000/api/worlds/WORLD_ID/events
curl -H 'Content-Type: application/json' -d '{"subscriptionId":"SUBSCRIPTION_ID"}' http://127.0.0.1:3000/api/worlds/WORLD_ID/presence
curl -H 'Content-Type: application/json' -d '{"type":"PLAY","tickIntervalMs":1000}' http://127.0.0.1:3000/api/worlds/WORLD_ID/actions
```

Replace IDs from creation/stream.ready; Finish Setup before Play. Renew the
current open subscription every 5s. Presence response is
`{worldId, revision, expiresInMs:15000}`; unknown, closed, expired or cross-world
IDs reject 400/INVALID_REQUEST, missing worlds 404/WORLD_NOT_FOUND. Unknown
presence fields reject. A fresh connection receives a fresh opaque ID. A prior
closed stream's ID cannot revive its lease; multiple open tabs remain independent.
Disconnect retains its remaining grace for ongoing playback, while a new Play
requires an open live lease. No client identity or durable presence rows added.

[stream-initial.json](../../apps/api/test/fixtures/stream-initial.json) is an
independent expected ready/snapshot fixture for a 2x1 empty finalized world at
revision 2. Streaming tests normalize only world/subscription IDs. Example wire
frames (data below is abbreviated only in this documentation):

```text
event: stream.ready
data: {"worldId":"...","subscriptionId":"..."}

event: world.snapshot
id: 2
data: {"worldId":"...","revision":2,"snapshotVersion":1,"runningTickIntervalMs":null,"state":{...}}

event: world.updated
id: 3
data: {"worldId":"...","revision":3,"snapshotVersion":1,"runningTickIntervalMs":1000,"state":{...},"historyEntries":[...]}

event: scheduler.error
data: {"worldId":"...","error":{"code":"INTERNAL_ERROR","message":"Playback stopped due to an error"}}

```

Ready/error have no event IDs. Initial snapshot omits historyEntries. Reconnect
always sends current state even with Last-Event-ID, then any current stopped
error; no snapshot replay. A committed Pause/End clears stopped status. Errors
stop operational scheduling and retain the committed lifecycle; no fabricated
Pause or automatic tick retries. Reloaded SQLite state is used on later actions.

Transport choices: at most 64 pending frames and 1MiB pending/socket bytes per
stream, with the same bounds on subscribe-time buffered updates. Oversized
frames also close the stream for resync. These are delivery limits, not robot
queue limits; HTTP still accepts the existing 8000-command fixture. Writer uses
Node response.write/drain and destroys slow/failed streams. Cancel closes without
a new wire event. Clients recover current state through GET/reconnect and history
queries. Deterministic stalled-writer tests cover bounds; real HTTP framing tests
do not claim to simulate kernel/network saturation.

Exported additions:

```ts
// http/application.ts
createApplication(path, { onDeliveryError?, clock?: Clock });
// playback/playback.ts
interface Clock {
  now(): number;
  setTimeout(run: () => void, delay: number): unknown;
  clearTimeout(handle: unknown): void;
}
// Playback coordinates HTTP actions, lease registration/renewal, loop status.
// Production now() uses monotonic performance.now().
// WorldService.playback / CommittedActions.playback are INTERNAL application seams:
// PLAY, AUTOMATIC_TICK, PAUSE with reason NO_CLIENTS. Never public DTO bypasses.
```

The first tick is scheduled after the Play interval; later one-shot timers follow
the prior tick. Intervals remain configuration, not throughput promises. Loop and
lease generations reject stale callbacks. Engine owns all tick calculation and
remains free of timers/SQL/Nest. All commits still use the existing transaction
and ordered publication seam, with scheduler status changed after commit and
before publication. App shutdown closes streams/timers before database disposal.

No frozen-contract changes or unresolved behavior questions were introduced.

## Next authorized phase

B5 backend work is complete; no next-phase implementation was started. Next is
phase 5 / frontend, requiring separate authorization. Read prompts/IMPLEMENT.md,
prompts/FRONTEND.md, FRONTEND.md, CONTRACT.md (D061/D062), ACCEPTANCE.md,
REVIEW_ITEMS.md, approved design/UI_UX_SPEC.md and design frames, this report,
B4_RESULTS.md, B3_RESULTS.md, README.md, and these API fixtures:

- `apps/api/test/fixtures/goto-step.json`
- `apps/api/test/fixtures/stream-initial.json`
- Real framing/race/reconnect examples in `apps/api/test/streaming.test.mjs`

Keep display revision separate from contiguous history cursor. Implement browser
heartbeats and lifecycle/error recovery against this actual API, then validate
UI flows; backend tests alone do not establish those remaining acceptance IDs.
