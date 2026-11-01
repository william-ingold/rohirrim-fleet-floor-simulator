# Approved boundary contract

Status: **approved and frozen for the documented boundary** (D050–D062).
R1–R5 are resolved in REVIEW_ITEMS.md. Preserve confirmed behavior and discuss
material changes with the user. Detailed SQL syntax, database pragmas,
dependency versions, and bounded transport defaults remain implementation
details within that boundary. Type sketches are documentation, not source files
or authorization to implement the application in this planning-only chat.

## Deployment boundary

One running Nest API process owns per-world action serialization, schedulers,
SSE publication/subscriptions, and the transient presence registry (D053).
Multiple browser clients are supported. Scaling and high availability are
outside scope; do not add replicas or distributed coordination. Confirmed
SQLite durability, failure handling, and server-restart recovery still apply.

## Vocabulary and representation

- World action: request to change the aggregate (placement, enqueue, lifecycle).
- Robot command: MOVE/LEFT/RIGHT/GOTO in a robot's ordered queue.
- Tick: one simultaneous simulation advance. Revision: one committed state change.
- t0: immutable baseline captured by Finish Setup, not a full historical timeline.
- Canonical robot IDs are strings R1, R2, ... with positive safe-integer numbers.
- Coordinates are integer x/y with southwest origin. No floats or pixel units.

```ts
type Facing = 'NORTH' | 'EAST' | 'SOUTH' | 'WEST';
type Lifecycle = 'SETTING_UP' | 'PAUSED' | 'PLAYING' | 'ENDED';
type Position = { readonly x: number; readonly y: number };

type CommandSnapshot =
  | { readonly type: 'MOVE' | 'LEFT' | 'RIGHT' }
  | {
      readonly type: 'GOTO';
      readonly target: Position;
      readonly consecutiveNoPathTicks: number;
    };

type RobotSnapshot = {
  readonly id: string;
  readonly position: Position;
  readonly facing: Facing;
  readonly battery: number;
  readonly queue: readonly CommandSnapshot[];
};

type WorldSnapshot = {
  readonly width: number;
  readonly height: number;
  readonly tick: number;
  readonly lifecycle: Lifecycle;
  readonly obstacles: readonly Position[];
  readonly chargers: readonly Position[];
  readonly robots: readonly RobotSnapshot[];
};
```

Serialize deterministic coordinate/robot ordering to simplify inspection and
tests. Do not persist occupancy caches, calculated paths, methods, timers,
connection IDs, or history inside WorldSnapshot. Queued GOTO starts with zero
progress; only its head instance accumulates failures. Snapshot validation checks
unique numeric robot identity, occupancy, bounds/features, queues/progress, and
battery range, not merely valid JSON. Active GOTO counter is 0..2 in retained
queues because the third no-path tick removes it.

Unsupported saved snapshot versions produce a clear unsupported-version error
and leave saved data untouched (D054). Do not reset worlds or automatically
convert their JSON format. No world-format changes are planned; any future JSON
upgrade requires an explicit migration. Versioned SQL schema migrations remain
required. Unsupported versions return HTTP 500 with
`UNSUPPORTED_SNAPSHOT_VERSION` (D059).

Input command DTOs omit progress; clients cannot assign failure counters, battery,
world lifecycle, or an entire replacement snapshot. Loader/factory reconstructs
immutable class instances from trusted, validated snapshots.

## World actions

Approved tags/payloads:

| Action | Payload | Legal lifecycle |
| --- | --- | --- |
| FINISH_SETUP | none | SETTING_UP |
| RESIZE | width, height | SETTING_UP; preserve/reject rule |
| PLACE_ROBOT | position, optional robotId and facing | SETTING_UP/PAUSED; UI omits ID and defaults NORTH; explicit re-placement supplies facing |
| REMOVE_ROBOT | robotId | SETTING_UP only (D065); removes robot and queue, retains history/features |
| SET_ROBOT_FACING | robotId, facing | SETTING_UP only (D065); immediate, preserves other robot state; same facing is a no-op |
| SET_OBSTACLE | position, enabled | SETTING_UP/PAUSED |
| SET_CHARGER | position, enabled | SETTING_UP/PAUSED |
| ENQUEUE_COMMANDS | robotId, commands[] | SETTING_UP/PAUSED; nonempty atomic batch |
| CLEAR_QUEUE | robotId | SETTING_UP/PAUSED |
| PLAY | tickIntervalMs: integer 100..5000 inclusive (D051/D052) | PAUSED and live client lease; PLAYING returns unchanged state (D055) |
| PAUSE | none | PLAYING; PAUSED returns unchanged state (D055) |
| STEP | none | PAUSED; one tick |
| END | none | PAUSED/PLAYING; ENDED returns unchanged state (D055) |
| CANCEL | none | SETTING_UP; approved 200 receipt exception (D050) |

Playback speed selection is local to each browser tab, starts at 1000ms per tick,
and resets to 1000ms on refresh. The user can select it during Setting Up or
Paused; PLAY passes `tickIntervalMs` to the server scheduler, which holds the
running interval outside durable simulation state (D051). Tabs may select
different values. Both UI and API enforce whole-number milliseconds from 100
through 5000 inclusive (D052). This is a configured interval, not a throughput
guarantee. Repeated PLAY leaves the running interval unchanged (D055).

Internal automatic Tick is not a public bypass around STEP/lifecycle/presence.
Internal auto-pause carries a no-clients reason, and restart recovery a restart
reason; clients cannot impersonate those server causes. Root scenario TICK N is
an adapter loop, not a requirement for a bulk HTTP endpoint.

Repeated PLAY while Playing, PAUSE while Paused, and END while Ended return
HTTP 200 with current committed state, unchanged revision, and empty new
historyEntries (D055). Do not create duplicate scheduler loops/history or change
the running interval on repeated PLAY. Edits on Ended still reject. These rules
do not authorize blind retries of non-idempotent STEP/ENQUEUE.

## Routes and envelopes

| Route | Purpose |
| --- | --- |
| POST /api/worlds | Create Setting Up world; optional dimensions default 10 x 8 |
| GET /api/worlds/:id | Current committed world |
| POST /api/worlds/:id/actions | One typed world action against latest state |
| GET /api/worlds/:id/history | Revision-paginated audit records |
| GET /api/worlds/:id/events | SSE subscription |
| POST /api/worlds/:id/presence | Renew lease with subscriptionId |

No expectedRevision parameter. Ordinary success envelope:

```ts
type WorldResponse = {
  worldId: string;
  revision: number;
  snapshotVersion: number; // transport metadata; state remains minimal
  runningTickIntervalMs: number | null; // transport metadata, not persisted (D061)
  state: WorldSnapshot;
  historyEntries: HistoryEntry[];
};
```

Creation returns 201, reads/actions 200. GET has empty historyEntries; history
is fetched separately. No-op action has unchanged revision and empty new entries.
CANCEL returns HTTP 200 with `{worldId, cancelled: true}` only after the atomic
draft deletion commits (D050). This approved exception omits the ordinary
snapshot/revision/history envelope because the world no longer exists. Failed
disposal surfaces an error and leaves the draft intact under D044; navigation
returns to creation only after commit. A subsequent GET returns 404.

After deletion commits, close the draft's SSE streams and invalidate its
subscriptions (D057). On stream loss, browsers check the world through GET. A
404 stops reconnection and returns to creation with "This draft is no longer
available." Network/server failures show a connection error without assuming
deletion. No dedicated cancellation SSE event is added.

Initial creation starts at revision 1 and tick 0, with a CREATE history entry
committed atomically alongside the initial Setting Up snapshot (D056). t0 stays
null until Finish Setup. Querying history after revision 0 includes the CREATE
entry and all subsequent retained history within the requested boundary.

```ts
type ErrorResponse = { error: { code: string; message: string } };
```

| HTTP | Category | Stable code |
| --- | --- | --- |
| 400 | Invalid DTO/grammar | INVALID_REQUEST |
| 404 | Missing world | WORLD_NOT_FOUND |
| 409 | Current lifecycle conflict | INVALID_LIFECYCLE |
| 422 | Well-formed but illegal domain action | INVALID_PLACEMENT |
| 503 | Temporary database unavailability | PERSISTENCE_UNAVAILABLE |
| 500 | Unexpected calculation/storage corruption/internal fault | INTERNAL_ERROR |
| 500 | Unsupported saved snapshot version | UNSUPPORTED_SNAPSHOT_VERSION |

Codes are approved under D059/D060. Do not expose stack traces or map every
database/programming failure to a misleading recoverable 503. Blocked movement
inside a valid Step is not an HTTP error. An old view alone is not a 409.

## Outcomes and audit history

Each tick outcome identifies its robot and represents independently:

- Physical result: resulting position, facing, battery.
- Movement: not attempted, succeeded, or blocked with one reason and optional
  direct blocker ID. Reasons: NO_BATTERY, OUT_OF_BOUNDS, OBSTACLE, CONTESTED,
  HEAD_ON_SWAP, OCCUPIED. Command no-path is not a physical attempted move.
- Command progress: none (idle), completed, continuing, or abandoned, with
  command type and UNREACHABLE when applicable.

Use tagged unions so impossible combinations are rejected at boundaries. Preserve
both arrival/completion and movement, blocked/turning, and charging/idle. Record
all robots on a tick. Detailed outcome type/tag names may be selected within
these approved semantics; they do not introduce additional domain rules.

HistoryEntry: worldId, revision, tick, timestamp, action (type/arguments), and
effects (including robot outcomes for ticks). No complete world copy per entry.
Current state changes and its entry commit together. True no-op/rejection has
neither new revision nor history. Timestamp is metadata, not engine input.

History query: afterRevision (exclusive), throughRevision (inclusive upper
boundary), and limit. Response fields are entries, nextAfterRevision, and hasMore.
Sort ascending, keep throughRevision stable while paginating, and validate
cursor inputs. Select/document bounded page defaults without introducing queue
limits. History cursor advances only over actually received contiguous history.

## SSE and presence protocol

| SSE event | Data | ID |
| --- | --- | --- |
| stream.ready | worldId, subscriptionId | none (transport metadata) |
| world.snapshot | worldId, revision, snapshotVersion, runningTickIntervalMs, state | revision |
| world.updated | ordinary WorldResponse with new historyEntries | revision |
| scheduler.error | worldId, error: {code, message} (D059) | none (operational notification) |

Serialize valid text/event-stream frames. Register/buffer before initial read;
send initial snapshot, drop buffered revisions <= snapshot, then send later
updates in order. Publication follows the serialized post-commit path; never
hold a SQLite transaction open for stream I/O. Bound queues; reconnect/resync
instead of growing per-client memory forever.

Always send current state on reconnect, even with Last-Event-ID. This protocol
does not promise historical snapshot replay. Process new stream.ready metadata
even if its following snapshot revision is duplicate. The browser keeps current
state revision and contiguous history cursor separately, deduplicating HTTP/SSE.

Create a transient lease with stream registration; renewal body is subscriptionId
and response fields are worldId, revision, expiresInMs. Every 5s, browser renews
its current open subscription's lease; expiry occurs at 15s since registration
or last valid renewal. Closed/superseded/expired IDs cannot be renewed. Closing
the stream stops renewal eligibility but retains remaining expiry grace.

Expire leases/check presence independently of world mutations, and again before
scheduled ticks. Last expiry schedules ordinary persisted Pause after an active
tick finishes. A reconnect within grace restores a new live lease; after actual
auto-pause it does not start Play. Presence responses reveal latest revision so
the client can recover a lost final world.updated event. Presence itself does
not change revision/history.

On automatic tick failure, scheduling stops under D022. Notify connected tabs
through SSE with a readable error and operational status indicating scheduling
has stopped; send current operational status to reconnecting tabs too (D058).
The UI shows "Playback stopped due to an error" while retaining the last
committed lifecycle, revision, and history. This status is separate from saved
simulation state and must not imply an uncommitted Paused transition. Use
`scheduler.error` with `{worldId, error: {code, message}}` and no event ID (D059).
Use `PERSISTENCE_UNAVAILABLE` for temporary database failures and `INTERNAL_ERROR`
for unexpected internal failures. Existing failure reconciliation and recovery
requirements remain in force.

`runningTickIntervalMs` is the scheduler's current interval, or null when no
scheduler is running for the world (D061). It is outside WorldSnapshot, is not
persisted, and creates no revision. Clients treat `scheduler.error` as null.

Recovery after `scheduler.error` is ordinary PAUSE, then PLAY (D062). PLAY stays a
no-op while the lifecycle is Playing. A failed PAUSE returns its error and changes
nothing. A committed Pause or End clears the stopped status.

## Approved SQLite table design and columns

| Table | Columns/constraints |
| --- | --- |
| worlds | id TEXT PK; revision INTEGER required; snapshot_version INTEGER required; snapshot_json TEXT required valid JSON; t0_json nullable valid JSON; created_at/updated_at TEXT |
| world_history | world_id FK worlds; revision INTEGER; tick INTEGER; timestamp TEXT; action_json TEXT; effects_json TEXT; unique/PK (world_id, revision) |
| schema_migrations | version unique/PK; applied_at TEXT |

Store tick/lifecycle/robots/features once in snapshot_json, not duplicate mutable
columns. t0_json is a separate immutable WorldSnapshot captured after Finish
Setup enters Paused at tick zero; no baseline before that. Column vocabulary is
approved under D060. Avoid sending t0 on every UI update when no
required feature uses it.

Use prepared SQL, foreign-key enforcement, JSON checks, and application/domain
validation. A foreign-key cascade may support the approved whole-draft Cancel
deletion; finalized-world deletion remains rejected by the application. Do not
add a history DELETE trigger that prevents authorized draft disposal, or claim
append-only history is secured solely by TypeScript types.

Capture baseline, snapshot, revision, and history in one BEGIN IMMEDIATE write
transaction. Configure journal/busy/durability pragmas deliberately and document
actual choices; do not claim power-loss guarantees without reviewing them. WAL
and a finite busy timeout are candidates, not additional approved defaults.

## Contract maintenance

R1 is resolved in D050, R2 in D051/D052, R3 in D053, and R4 in D054. R5 is
resolved in D055–D060. D061/D062 amend the boundary after design review. The
documented boundary is frozen; discuss material
changes before updating DECISIONS/ARCHITECTURE and this contract. During later
authorized implementation, use matching JSON fixtures in API and frontend
tests. Backend owns validation
and committed outcomes; frontend can use type-only domain snapshot definitions
without importing Nest/database runtime into the browser. Do not add an extra
workspace package merely to share a tiny envelope without reviewing that change.
If local API/client envelope types are mirrored, verify their contract together.
