# Phase 3 / B3 implementation results

Authorized slice: SQLite persistence and application service only. The closing
B1 mention was treated as prior-slice context, following B2's recorded handling;
this interpretation was stated before implementation. No HTTP controllers/server,
Nest bootstrap, UI, scheduler, SSE or presence were built. Existing user planning
and design changes were preserved. CONTRACT.md and engine behavior are unchanged.

## Acceptance evidence

| IDs | Actual evidence/status |
| --- | --- |
| D01 | Temporary on-disk database close/reopen preserves complete snapshots, battery, features, queues and active GOTO counter. Startup validates all saved worlds; invalid battery, duplicate identity, bad GOTO progress, missing finalized t0 and unsupported versions reject without resetting saved data. |
| D02 | Real SQL triggers fail CREATE, Finish Setup, tick history and Cancel deletion. Tick trigger observes the updated snapshot before failing. Rollback preserves revision, queues, battery, GOTO progress, t0 and history, including after reopen. Deferred foreign-key failure at COMMIT rolls back; observed write count proves no automatic retry. Competing writer produces SQLITE_BUSY with no change. |
| D03 | Snapshot/revision/history commit together; CREATE starts at revision 1. SQL enforces JSON, foreign keys, unique world/revision, immutable t0 and retained history. Migration failure rolls back DDL/ledger; constructor propagates migration errors and unknown ledger versions prevent startup. |
| D04, persistence portion | Startup persists PAUSE with SERVER_RESTART reason for saved Playing worlds, preserving actual tick/battery/queues/t0/history. Repeated startup does not add another Pause. Setting Up/Paused/Ended remain unchanged. Failure on the second recovery world rolls back the whole recovery batch and prevents construction. HTTP/server lifecycle integration remains pending. |
| L01–L04, application portions | Atomic baseline capture; later edits preserve it; no-op/rejection has no revision/history; repeated Play/Pause/End preserve state; idle Step advances both; resize rejects out-of-bounds queued target; separate callers use latest saved state; End is terminal. API/UI portions remain pending. |
| L05, persistence portion | Draft/history disposal is atomic, failed cascade restores both, successful disposal returns receipt and subsequent read is missing; finalized Cancel rejects. HTTP/other-tab/UI behavior remains pending. |
| A03, storage groundwork only | History pages are ascending, bounded, exclude afterRevision and include throughRevision; adding revisions during catch-up does not change an explicitly retained upper boundary. HTTP acceptance is not claimed. |

Existing E01–E08, P01–P06, B01–B05, engine L01–L04 and C01–C08 remain green.
Selected engine regressions were exercised through the built public engine; no
engine production files changed. No overall application/frontend readiness claim.

## TDD and actual commands

All commands used Node 26.13.0 from `/tmp/node-v26.13.0-linux-x64/bin` on PATH.

| Command/check | Actual result |
| --- | --- |
| API workspace build then `node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand` against service stub | Red: 8 tests executed, 8 failed |
| Same command after durable action implementation | Green: 8 passed |
| `npm run test:persistence`, after response-helper refactor | 8 passed; engine/persistence builds passed |
| `npm run test:persistence`, with startup/recovery tests before implementation | Red: 6 failed, 13 passed |
| Same command after startup implementation | Green: 19 passed |
| Same command after recovery/cleanup refactor and five additional audit cases | Green: 24 passed; additional cases passed on introduction, no red claim |
| `npm run test:persistence`, final repeated-Play audit | Red: 1 failed/24 passed, then green: 25 passed after correcting the no-op branch |
| Final `npm test` | All three builds passed; 108 Vitest tests in five files and 25 Jest tests in one file passed (133 total) |
| `npm run typecheck` | Strict production/test TS check passed, including persistence source |
| `git diff --check` | Passed |

Clean-install check: sandboxed `npm ci --offline --cache
/tmp/rohirrim-npm-cache` failed at better-sqlite3's native rebuild. The same
command outside the sandbox succeeded (435 packages added), with install-script
approval/deprecation notices. The post-reinstall suite passed 132 tests before
the final no-op audit, and the final suite passed 133. Ordinary online npm ci
was not separately tested. The documented in-process setup/action fixture also
ran through Node ESM and passed explicit assertions. `npm run scenario --
scenarios/goto-charger.txt` built only engine/CLI and printed all six expected
report lines after reinstall.

Jest runs native ESM `.mjs` integration tests against built strict TypeScript;
no TS transformer or framework mocks. Vitest is scoped to engine/CLI tests so the
runners do not collect each other's tests. Jest emits Node's VM Modules and
localStorage experimental warnings. The full suite's existing CLI child-process
tests require escalation in this environment; focused SQLite tests run sandboxed.

Dependency versions verified against official npm metadata: better-sqlite3
13.0.3, Jest 30.2.0, @types/better-sqlite3 9.6.0, @types/jest 30.0.0. One lockfile
is retained. Registry access/install required escalation after sandbox DNS errors.
An online npm audit reported **19 findings (3 low, 16 moderate)**, all in Jest's
development tree (glob/minimatch/deepmerge and dependents). The install initially
reported 1 low/18 moderate. No forced major downgrade/override was applied.
No zero-vulnerability claim is made from offline installation output.

## Migration setup and durable seam

After `npm ci` and `npm run build`, application bootstrap can use:

```js
import { openDatabase } from './apps/api/dist/persistence/database.js';
import { WorldService } from './apps/api/dist/floors/world-service.js';

const db = openDatabase('/tmp/fleet-floor.sqlite');
try {
  const worlds = new WorldService(db); // migrations, validation, durable recovery
  const created = worlds.create();
  console.log(worlds.get(created.worldId));
} finally {
  db.close();
}
```

The caller owns connection closure, including when startup throws. Construct the
service **once at process startup**, before exposing reads/actions; construction
is a restart boundary, never a per-request dependency factory. Preserve the
`apps/api/migrations/` directory alongside the built workspace. Versioned SQL is
loaded relative to the module; migration 001 creates worlds/world_history and
triggers, and the runner creates schema_migrations in the migration transaction.
All pending SQL migrations run in one BEGIN IMMEDIATE transaction.

Connection choices: foreign_keys ON, journal_mode WAL, synchronous FULL, finite
5000ms busy timeout. Tests verify these values on a real file database. No
physical disk-failure/power-loss durability guarantee or performance claim.
Driver semantics were checked against its [official transaction documentation](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#transactionfunction---function).

Every mutation begins IMMEDIATE before loading current state. Synchronous calls
serialize in the approved single process, with no async gaps or cached world.
The driver commits before the service returns; errors propagate with no automatic
retry. Later calls reload SQLite. An uncertain external outcome must be reconciled
by reading durable state before deciding whether to issue another non-idempotent
action. Delivery/notification is absent in B3, so no uncommitted publication path
exists; actual SSE post-commit/order tests remain for B4/B5.

Exported source types live in `apps/api/src/floors/types.ts`:

```ts
type CommittedWorld = {
  readonly worldId: string;
  readonly revision: number;
  readonly snapshotVersion: number;
  readonly state: WorldSnapshot;
  readonly historyEntries: readonly HistoryEntry[];
};
type CancelReceipt = { readonly worldId: string; readonly cancelled: true };
// WorldService: create(width?, height?), get(id), act(id, WorldAction),
// history(id, {afterRevision?, throughRevision?, limit?})
```

WorldSnapshot/outcomes remain the existing public engine types. The internal
CommittedWorld seam omits scheduler metadata; the future transport must add
`runningTickIntervalMs` for the frozen WorldResponse. New PLAY transitions reject
because the required presence/scheduler adapter is absent; repeated PLAY against
an already Playing world remains a no-op. B5 must implement the
guarded Play/automatic-tick service path and operational scheduling together;
it must not expose an unchecked Play bypass. Recovery tests seed a previous
process's committed Playing row/history, without adding fake playback infrastructure.

The service accepts typed application inputs; B4 still owns unknown HTTP DTO
validation and stable HTTP error mapping. DomainError codes propagate unchanged;
missing/unsupported/corrupt state uses StorageError codes WORLD_NOT_FOUND,
UNSUPPORTED_SNAPSHOT_VERSION and INTERNAL_ERROR. SQLite exceptions retain native
codes for later distinction of temporary failures from corruption/internal faults.

Example in-process fixture (not an HTTP/stream fixture):

```js
const created = worlds.create(2, 1);
worlds.act(created.worldId, { type: 'PLACE_ROBOT', position: { x: 0, y: 0 } });
worlds.act(created.worldId, { type: 'ENQUEUE_COMMANDS', robotId: 'R1', commands: [{ type: 'MOVE' }] });
worlds.act(created.worldId, { type: 'FINISH_SETUP' });
const result = worlds.act(created.worldId, { type: 'STEP' });
// revision 5, tick 1, PAUSED; R1 at (0,0) NORTH, battery 100, empty queue.
// historyEntries[0].effects.outcomes[0].movement:
// {status: 'BLOCKED', reason: 'OUT_OF_BOUNDS'}
```

History defaults: afterRevision 0, throughRevision current revision, limit 100;
maximum page limit 500. Clients must retain a fixed throughRevision for catch-up.
nextAfterRevision advances to the last returned entry, or remains at the input
cursor on an empty page. These are query bounds, never queue caps. History stores
actions and tick outcomes without complete world copies. Auto-assigned placement
identity is included in effects.robotId. t0 is separate and never in responses.

## Remaining work and next handoff

Completed B3 acceptance: **D01–D03**; persistence/application portions of
**D04 and L01–L05**. Remaining: **L01–L05 API/UI portions, D04 server integration,
A01–A03, S01–S10, U01–U08**. No known failing B3 tests. No HTTP/stream fixtures,
Supertest/Nest adapter checks, browser validation, coverage or performance claim.

Next requires separate authorization: **B4 HTTP (remaining phase 3 work)**, then
**B5 scheduler/SSE/presence (phase 4)**. Read prompts/IMPLEMENT.md then
prompts/BACKEND.md, this report, B1_RESULTS.md, B2_RESULTS.md, README.md,
HANDOFF.md, DECISIONS.md, ARCHITECTURE.md application/persistence sections,
IMPLEMENTATION_PLAN.md, BACKEND.md B4/B5, REVIEW_ITEMS.md, CONTRACT.md and
ACCEPTANCE.md L/D/A/S cases. Retain the 25 real-SQLite tests, existing engine/CLI
fixtures and pinned single lockfile. Freeze HTTP/stream fixtures against the
approved envelope before implementing adapters. No contract changes/questions
requiring user review were introduced.
