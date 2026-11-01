# Phase 3 / B4 implementation results

Authorized slice: Nest HTTP adapter and committed update publication seam on the
existing B3 service. User explicitly corrected the initial B3/B1 references to
B4. No UI, scheduler, SSE subscription endpoint or presence endpoint was built.
Existing user planning/design edits were preserved. No changes to engine rules,
B3 transactions, SQL migrations, or the frozen contract.

## Acceptance evidence

| IDs | Actual evidence/status |
| --- | --- |
| A01, HTTP portion | Create/read/action routes; strict unknown-input validation; latest saved-state actions without expectedRevision; stable 400/404/409/422/503/500 envelopes. Real writer lock returns 503. Invalid saved state/version return the specified 500 codes without raw details. New PLAY remains guarded for B5. |
| A02, HTTP/publication seam | Blocked Step returns 200 and outcomes. Failed history insertion returns only an error; snapshot, queue, revision and t0 remain committed values. Subscribers independently read committed snapshot/history from SQLite. Rollback/no-op emits nothing. Delivery and diagnostic errors cannot turn committed success into rejection. |
| A03 | Real HTTP history pages are ascending, bounded, exclusive after/inclusive through. A retained upper boundary excludes intervening commits. Invalid, repeated and unknown query fields reject; no duplicate revisions across the fixture pages. |
| D04 | Application factory finishes validation/recovery before serving requests. Restart persists/logs SERVER_RESTART Pause, preserving tick, robots, queues, battery and t0. Unsupported saved version prevents construction and leaves revision untouched. Existing B3 batch rollback tests remain green. |
| L01–L05, HTTP/application portions | Finish Setup baseline is atomic and immutable across later HTTP edits. Lifecycle conflicts reject, repeated Pause/End preserve revision, idle Step advances. Resize rejects queued out-of-bounds targets without clipping. Failed Cancel preserves draft/history; successful Cancel returns receipt and later reads/history return 404. Finalized Cancel rejects. Playing controls and cancellation stream cleanup remain B5; UI portions remain pending. |
| S02/S08, groundwork only | Synchronous in-process handoff preserves order even with reentrant commits and isolates subscribers. Unsubscription and failed-delivery behavior tested. No real HTTP SSE framing/race/reconnect claim. |

All 42 engine tests were selected/run before implementation, covering E01–E08,
P01–P06, B01–B05 and engine L01–L04. The final suite also retains all CLI and B3
checks. No overall application/frontend completion claim.

## TDD and actual validation

All commands used Node 26.13.0 from `/tmp/node-v26.13.0-linux-x64/bin` on PATH.
Jest executes built strict TypeScript as native ESM; no framework/database mocks.
HTTP tests use Supertest with a real Nest listener and temporary file SQLite DB.

| Command/check | Actual result |
| --- | --- |
| `npm run test:engine -- --reporter=dot` | 42 passed |
| API build, then `node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand apps/api/test/http.test.mjs` against explicit adapter stub | Red: 17 failed |
| Same HTTP command after adapter implementation | Green: 17 passed; sandbox listen EPERM required escalation |
| HTTP suite with publication stub | Red: 1 failed/17 passed |
| HTTP suite with optional-body/startup audits | Red: 2 failed/19 passed |
| HTTP suite after publication/default-body implementation | Green: 21 passed |
| Built executable bootstrap suite against explicit stub | Red: 2 failed |
| `npm run test:http` after executable implementation and three audit tests | 1 failed/25 passed: test incorrectly expected status 0 rather than forwarded SIGTERM; oracle corrected after inspecting installed Nest lifecycle source |
| Full `npm test`, then typecheck/diff check | Green: 159 tests before final content-type audit |
| Focused HTTP command with `-t non-JSON` | Red: 1 failed/24 skipped; unsupported body incorrectly created a default world |
| Final `npm test` after JSON request guard | All builds passed; 108 Vitest + 52 Jest tests passed (160 total: 25 SQLite, 25 HTTP, 2 executable) |
| Final `npm run typecheck` and `git diff --check` | Passed |

Refactor after initial green removed framework logging from the application
publication seam. Additional contract-fixture, baseline/resize and reentrant
subscriber audits passed on introduction; no red claim for those. The final
executable test launches a separate server process, performs HTTP creation,
requests SIGTERM, and reopens the database to verify the committed world.

Registry version checks/install required escalation after sandbox EAI_AGAIN.
Exact additions: Nest common/core/platform-express 12.3.2, reflect-metadata 0.2.2,
rxjs 7.8.2, Supertest 7.3.1. One lockfile remains. Installation reported 19
findings (3 low, 16 moderate); no forced remediation or new independent audit
claim. No clean reinstall was performed for B4. Jest emits existing VM Modules
and localStorage warnings. HTTP/process tests need escalation in this environment.
No performance, power-loss, coverage, browser, deployment or stream claims.

## HTTP setup and fixtures

After `npm ci`:

```sh
DATABASE_PATH=/tmp/fleet-floor.sqlite PORT=3000 npm run start:api
npm run test:persistence
npm run test:http
```

The start script builds engine/API and listens on 127.0.0.1 after migrations,
validation and recovery. Defaults: `fleet-floor.sqlite` in cwd and port 3000.
Port 0 is allowed for an OS-selected test port. Invalid PORT rejects before
creating a DB. The caller provides an existing writable database directory.
SIGINT/SIGTERM invoke Nest shutdown and close the owned connection. Preserve
`apps/api/migrations/` alongside dist; B3_RESULTS.md documents SQL and pragmas.

Routes implemented:

- POST /api/worlds: optional JSON dimensions (or no body), 201.
- GET /api/worlds/:id: committed envelope with empty historyEntries, 200.
- POST /api/worlds/:id/actions: typed action, 200; Cancel receipt exception.
- GET /api/worlds/:id/history: bounded query, 200.

Nonempty POST bodies require application/json. Unknown fields, client snapshots,
expectedRevision, server pause reasons and command progress reject atomically.
No coercion of strings to numbers/booleans. History defaults remain after 0,
through current revision, limit 100 (maximum 500). Caller retains throughRevision
across pages. Robot queues have no introduced item cap: the HTTP test appends
8,000 legal commands in a JSON body larger than Express's default 100KB limit.
No automatic mutation retries. Resolve uncertain outcomes by reading saved state.

[goto-step.json](../../apps/api/test/fixtures/goto-step.json) is a hand-authored
request/action sequence and complete expected response: GOTO arrival on a 2 x 1
floor, revision 5/tick 1, battery 99, completed queue. The test normalizes only
opaque world IDs and timestamps. This fixture can seed frontend contract checks.
No HTTP stream fixture exists in B4.

Exported source seams:

```ts
// http/worlds-controller.ts
 type WorldResponse = CommittedWorld & {
   readonly runningTickIntervalMs: number | null;
 };
// http/application.ts
 createApplication(databasePath: string, options?: {
   onDeliveryError?: (error: unknown) => void;
 }): Promise<NestExpressApplication>;
// floors/committed-actions.ts
 type CommittedEvent =
   | { readonly type: 'WORLD_COMMITTED'; readonly world: CommittedWorld }
   | { readonly type: 'DRAFT_CANCELLED'; readonly worldId: string };
// CommittedUpdates.subscribe(listener) returns unsubscribe.
// CommittedActions.create/act invoke WorldService, then publish after commit.
```

Use one application factory/WorldService per process startup. `app.close()` owns
DB closure; factory failures close its connection too. Production HTTP writes
use CommittedActions. B5 must route future scheduled changes through the same
ordered post-commit handoff. Subscribers synchronously enqueue transport work;
they must not await I/O in this callback. Each gets a separate event copy. Delivery
errors are reported without retrying actions; the optional diagnostic callback
must not be treated as a mutation failure. This is an in-process seam, not a
durable outbox, replay queue or real SSE implementation. DRAFT_CANCELLED is only
an internal notification for future stream disposal, not a new wire event.

`runningTickIntervalMs` is currently null; no operational scheduler exists.
B5 must source it from scheduling on all HTTP/SSE envelopes. New PLAY retains
B3's lifecycle rejection until valid presence and scheduling are implemented;
there is no unchecked playback bypass. Repeated PLAY of an already Playing row
retains B3's no-op behavior. SSE and presence URLs currently return 404.

Implementation follows the official [Nest exception filter](https://docs.nestjs.com/exception-filters),
[lifecycle](https://docs.nestjs.com/fundamentals/lifecycle-events), and
[Supertest](https://github.com/forwardemail/supertest) APIs; installed Nest source
confirmed shutdown signal forwarding. No contract changes or unresolved material
behavior questions were introduced.

## Remaining work and next handoff

B4 HTTP evidence covers A01–A03, D04 and HTTP/application L01–L05 within the
explicit playback boundary above. Remaining: **A01/L02 playback integration,
L05 stream/other-tab/UI behavior, S01–S10, U01–U08**, and UI portions of L01–L04.
No known failing B4 tests. B4 is usable for setup/manual Steps, not playback or
browser synchronization. B5 must complete the real-SSE portions of A02/S02.

Next, with separate authorization: **phase 4 / B5 scheduler/SSE/presence**.
Read prompts/IMPLEMENT.md, prompts/BACKEND.md, this report, B3_RESULTS.md,
B1_RESULTS.md, B2_RESULTS.md, README.md, HANDOFF.md, DECISIONS.md,
ARCHITECTURE.md application/stream sections, IMPLEMENTATION_PLAN.md, BACKEND.md
B5, REVIEW_ITEMS.md, CONTRACT.md (including D061/D062), ACCEPTANCE.md S cases,
and the new HTTP fixture. Retain the 160 tests and exact dependency pins. Add
real SSE framing/subscribe-race fixtures, bounded delivery buffers, valid Play
leases, operational interval/error metadata, and generation-safe scheduling.
