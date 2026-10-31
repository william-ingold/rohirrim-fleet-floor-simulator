# Boundary contract for implementation review

Status: confirmed semantics with **proposed exact DTO/type/SQL names**. The user
approved the response/event model, but not every field/action identifier below.
Resolve REVIEW_ITEMS.md and freeze this document before dependent coding. Type
sketches are documentation, not source files or application implementation.

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

Input command DTOs omit progress; clients cannot assign failure counters, battery,
world lifecycle, or an entire replacement snapshot. Loader/factory reconstructs
immutable class instances from trusted, validated snapshots.

## World actions

Proposed tags/payloads:

| Action | Payload | Legal lifecycle |
| --- | --- | --- |
| FINISH_SETUP | none | SETTING_UP |
| RESIZE | width, height | SETTING_UP; preserve/reject rule |
| PLACE_ROBOT | position, optional robotId and facing | SETTING_UP/PAUSED; UI omits ID and defaults NORTH; explicit re-placement supplies facing |
| SET_OBSTACLE | position, enabled | SETTING_UP/PAUSED |
| SET_CHARGER | position, enabled | SETTING_UP/PAUSED |
| ENQUEUE_COMMANDS | robotId, commands[] | SETTING_UP/PAUSED; nonempty atomic batch |
| CLEAR_QUEUE | robotId | SETTING_UP/PAUSED |
| PLAY | tickIntervalMs, pending R2 | PAUSED and live client lease |
| PAUSE | none | PLAYING |
| STEP | none | PAUSED; one tick |
| END | none | PAUSED/PLAYING |
| CANCEL | none | SETTING_UP; response exception pending R1 |

Internal automatic Tick is not a public bypass around STEP/lifecycle/presence.
Internal auto-pause carries a no-clients reason, and restart recovery a restart
reason; clients cannot impersonate those server causes. Root scenario TICK N is
an adapter loop, not a requirement for a bulk HTTP endpoint.

For a repeated lifecycle request already in its desired state, proposed behavior
is a no-op for PLAY while Playing and PAUSE while Paused, without duplicate
loops/history. END on Ended can return unchanged read-only state, while edits on
Ended reject. These exact repeated-action rules need review under R5; do not
assume retry safety for non-idempotent STEP/ENQUEUE from this proposal.

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
  snapshotVersion: number; // proposed transport metadata; state remains minimal
  state: WorldSnapshot;
  historyEntries: HistoryEntry[];
};
```

Creation proposes 201, reads/actions 200. GET has empty historyEntries; history
is fetched separately. No-op action has unchanged revision and empty new entries.
CANCEL cannot return the deleted world as current state; resolve R1's receipt
exception before implementing it. For initial creation, propose revision 1 and
a CREATE history record in the same transaction, with nullable t0. Review under
R5 so cursors have an explicit starting point; don't infer zero-vs-one silently.

```ts
type ErrorResponse = { error: { code: string; message: string } };
```

| HTTP | Category | Example stable code |
| --- | --- | --- |
| 400 | Invalid DTO/grammar | INVALID_REQUEST |
| 404 | Missing world | WORLD_NOT_FOUND |
| 409 | Current lifecycle conflict | INVALID_LIFECYCLE |
| 422 | Well-formed but illegal domain action | INVALID_PLACEMENT |
| 503 | Temporary database unavailability | PERSISTENCE_UNAVAILABLE |
| 500 | Unexpected calculation/storage corruption/internal fault | INTERNAL_ERROR |

Codes are proposed exact identifiers. Do not expose stack traces or map every
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
all robots on a tick. Event names beyond required UNREACHABLE are proposed
implementation vocabulary, not additional domain rules.

HistoryEntry: worldId, revision, tick, timestamp, action (type/arguments), and
effects (including robot outcomes for ticks). No complete world copy per entry.
Current state changes and its entry commit together. True no-op/rejection has
neither new revision nor history. Timestamp is metadata, not engine input.

History query: afterRevision (exclusive), throughRevision (inclusive upper
boundary), and limit. Response proposes entries, nextAfterRevision, and hasMore.
Sort ascending, keep throughRevision stable while paginating, and validate
cursor inputs. Select/document bounded page defaults without introducing queue
limits. History cursor advances only over actually received contiguous history.

## SSE and presence protocol

| SSE event | Data | ID |
| --- | --- | --- |
| stream.ready | worldId, subscriptionId | none (transport metadata) |
| world.snapshot | worldId, revision, snapshotVersion, state | revision |
| world.updated | ordinary WorldResponse with new historyEntries | revision |

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
and response proposes worldId, revision, expiresInMs. Every 5s, browser renews
its current open subscription's lease; expiry occurs at 15s since registration
or last valid renewal. Closed/superseded/expired IDs cannot be renewed. Closing
the stream stops renewal eligibility but retains remaining expiry grace.

Expire leases/check presence independently of world mutations, and again before
scheduled ticks. Last expiry schedules ordinary persisted Pause after an active
tick finishes. A reconnect within grace restores a new live lease; after actual
auto-pause it does not start Play. Presence responses reveal latest revision so
the client can recover a lost final world.updated event. Presence itself does
not change revision/history. Lifecycle error/status delivery when persistence
fails while a world still says Playing is an operational message, not a fake
committed state change; exact UI notification mechanism needs R5 review.

## SQLite schema design (proposed exact columns)

| Table | Columns/constraints |
| --- | --- |
| worlds | id TEXT PK; revision INTEGER required; snapshot_version INTEGER required; snapshot_json TEXT required valid JSON; t0_json nullable valid JSON; created_at/updated_at TEXT |
| world_history | world_id FK worlds; revision INTEGER; tick INTEGER; timestamp TEXT; action_json TEXT; effects_json TEXT; unique/PK (world_id, revision) |
| schema_migrations | version unique/PK; applied_at TEXT |

Store tick/lifecycle/robots/features once in snapshot_json, not duplicate mutable
columns. t0_json is a separate immutable WorldSnapshot captured after Finish
Setup enters Paused at tick zero; no baseline before that. Exact capture/version
spelling is R5 review vocabulary. Avoid sending t0 on every UI update when no
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

## Review/freeze procedure

Resolve R1–R5. Record exact contract vocabulary in DECISIONS/ARCHITECTURE, then
use matching JSON fixtures in API and frontend tests. Backend owns validation
and committed outcomes; frontend can use type-only domain snapshot definitions
without importing Nest/database runtime into the browser. Do not add an extra
workspace package merely to share a tiny envelope without reviewing that change.
If local API/client envelope types are mirrored, verify their contract together.
