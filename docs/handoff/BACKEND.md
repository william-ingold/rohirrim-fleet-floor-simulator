# Backend implementation handoff

Audience: coding agent implementing authorized backend phases. Read HANDOFF.md,
DECISIONS.md, ARCHITECTURE.md, CONTRACT.md, ACCEPTANCE.md, and REVIEW_ITEMS.md.
This document is a plan, not authority to start implementation in the planning chat.

## Domain and boundaries

Use one simulation bounded context. World is the aggregate root coordinating all
robot and cell invariants. Robot and concrete Command classes are immutable;
Command is an interface without an abstract base class. Position is a value;
Cell may be a value/feature record, not a mutable occupancy entity. Scenario is
an adapter, not a second world implementation. Keep language consistent:
world action, robot command, intent, resolution, tick, revision, t0, history.

Application service owns serialized requests, database transaction boundaries,
real-time scheduling, presence, and publication. HTTP controllers validate
transport shape and delegate. A small repository/migration boundary is useful;
do not create repositories for robots/commands stored inside the world snapshot.
No Nest imports, SQL, clocks, timers, network, randomness, or mutable global state
inside packages/engine. Generate opaque world IDs/timestamps outside the engine.

## Phase B1: immutable domain and ticks

Write acceptance tests first. Build immutable World/Robot construction,
placement/re-placement, feature edits, queue append/clear, and lifecycle guards.
World owns authoritative references; snapshots must not leak mutable aliases.
Validate hydrated data, not just compile-time types. Keep positional/facing,
battery, queue and GOTO progress restoration complete.

Tick pipeline:

1. Read every robot from one start-of-tick snapshot. No command sees another's
   already-updated position. Only queue heads may plan/progress.
2. Handle primitive rotation/idle and GOTO planning. GOTO treats every other
   starting robot cell as a wall; do not speculate on its departure. Use shortest
   four-neighbor paths with NORTH/EAST/SOUTH/WEST first-step preference.
3. GOTO at target completes without executing its successor. No path preserves
   facing, increments the counter, waits, and abandons on the third consecutive
   failure. A found path resets the counter and requests free facing + movement.
4. Exclude zero-battery movement with NO_BATTERY before geometry/contention.
   Then reject bounds/obstacles; select numeric-ID contention winners once.
5. Resolve head-on swaps, dependency chains, occupied stationary/blocked cells,
   and permitted cycles of at least three (four is the smallest geometric grid
   cycle here). Never reconsider a contention loser. Use linear dependency
   reasoning or a clear equivalent; avoid sequential move mutation.
6. Build next robots together. Preserve GOTO facing after blocked movement.
   Consume ordinary commands even on failure; retain unfinished GOTO. Apply
   successful-move battery cost, then +10 charging capped at 100 for all end-cell
   charger occupants, including idle robots. Advance tick once.
7. Produce outcomes for every robot, separating physical effects, movement,
   and command progress; include direct blocker information when useful.

The resolver should remain independently testable with snapshots/intents. A
fancy graph library is unnecessary. Verify iteration-order invariance with
permutations and invariants: unique occupancy, bounded positions/battery, no
obstacle entry, immutable inputs, and one command head processed per robot/tick.

## Phase B2: CLI adapter

Parse into complete actions before applying a line; reject an invalid whole
batch without valid-prefix acceptance. Follow D026/D027/D038–D045 exactly:
case-insensitive commands, canonical numeric robot IDs, whitespace around commas,
whole-line comments only, positive TICK counts, mixed GOTO queue grammar, and
setup-only FLOOR replacement. UI resize semantics do not replace CLI FLOOR rules.

Default 5 x 5. First valid TICK finalizes t0 then executes Steps; REPORT does not
finalize setup. EOF ends without draining queues or printing a final report.
REPORT output is numeric-ID sorted and exact; empty reports print EMPTY. Battery
report prints `Rn <battery>`. File/invocation errors go to stderr with nonzero
exit; recoverable invalid lines do not terminate the runner.

Create scenarios/*.txt and distinct expected-output fixtures, retaining the
user's test-scenarios/ references. Do not manufacture expected output by calling
the engine under test. Verify root invocation without API/database startup.

## Phase B3: SQLite and application service

Use better-sqlite3, prepared SQL, versioned transactional migrations and a
migration ledger. Follow reviewed CONTRACT.md schema; never create a full ORM
or separate robot rows. Configure foreign-key checks on the connection and
review actual transaction/error behavior against selected library docs.

For a state-changing action, serialize per world and use BEGIN IMMEDIATE before
reading state. Load/validate, compute next immutable state, update snapshot +
revision, insert history, capture t0 on Finish Setup, then commit. Return/publish
only committed data. A rejected action/true no-op does not create history or
revision; an idle tick still changes time and is recorded. Cancel is the explicit
whole-draft deletion exception; never mutate a retained world's history entries.

On failure, roll back and retain committed state. No partial cache update or
queue consumption. Unknown commit outcomes require reconciliation; do not
blindly run the action again. Migration/corrupt-state failures surface errors,
not empty default worlds. If a tick cannot persist, stop its scheduler and show
an error; do not pretend a Paused database write succeeded.

On server startup, persist/log Playing -> Paused before accepting edits or
playback for those worlds. Preserve t0 and actual logical time; do not convert
restore into a new run. Worlds saved as Setting Up, Paused, or Ended retain those
lifecycle states.

## Phase B4: HTTP and committed update publication

Implement the agreed single typed world-action endpoint plus read/create/history,
SSE, and presence endpoints. Validate actions against latest committed state;
do not add expectedRevision or client-submitted world replacement. Selection of
one user request does not skip server validation or serialize only in the UI.

Publish after commit while preserving per-world revision order. HTTP response
and SSE may both expose the same revision: clients deduplicate. A delivery error
does not roll back a committed action or turn it into a retryable domain rejection.
Separate failed persistence from failed delivery. Reconcile after ambiguous
client timeout; do not claim exactly-once requests without an idempotency protocol.

History queries use per-world revision pagination and an upper boundary so a
moving world does not make a catch-up traversal unstable. Current state remains
usable while history loads. No snapshot replay/timeline endpoint is committed.

## Phase B5: scheduler, presence, and SSE

Keep logical ticks in World and wall-clock triggers in an application service.
Only one active loop per world; no overlapping ticks. Pause/End serialize after
an in-progress tick and prevent stale callbacks from executing later. A stale
automatic callback must not act like an allowed manual Step. Tag/check playback
generations if useful so an old callback cannot tick a later Play session.

Expose the scheduler's current interval as `runningTickIntervalMs` on WorldResponse,
`world.snapshot`, and `world.updated`, null when no scheduler is running (D061). Do
not persist it. After `scheduler.error`, ordinary PAUSE then PLAY is the recovery
path, and a committed Pause or End clears the stopped status (D062).

Browser leases renew every 5 seconds and expire after 15 seconds. Presence is
transient transport metadata, not a world change/history flood. Keep disconnected
leases' remaining grace, but do not accept late renewals for closed/superseded
subscriptions. A replacement subscription gets a fresh ID. At last expiry,
finish an active tick and atomically Pause with a no-clients history reason.
Recheck presence when scheduled work executes. Reconnect does not automatically
resume a Paused world. Require valid presence for interactive Play; not CLI Steps.

Register/buffer the subscriber before reading its snapshot; send stream.ready,
then world.snapshot, then only revisions newer than the snapshot. Do not lose
a commit in a GET-to-subscribe race. Reconnect sends current state and history
catch-up uses separate queries, not replayed tick animations. Bound buffers and
clean up stream listeners/timers; slow clients must resync rather than grow
unbounded memory. Exact thresholds are transport limits, not queue-domain limits.

## Required evidence

- Meaningful engine/CLI tests and independent expected fixtures.
- Real SQLite restart/load and baseline immutability tests.
- Failure injected after snapshot update but before history completion proves
  rollback restores both; tests also preserve queued command progress.
- HTTP boundary tests for success, rejection, latest-state behavior, cancellation,
  persistence failure, history order, and SSE delivery after commit only.
- Deterministic clock tests for Pause/End timing, stale callbacks, expiry with
  one/two clients, reconnect grace, and no automatic resume.
- At least one actual streaming HTTP test parses SSE framing/event IDs and
  cleans up sockets; an in-memory event-emitter unit test alone is insufficient.
- Report commands actually executed, acceptance IDs completed, and unresolved
  items. Update AI_USAGE.md honestly and hand the frozen contract/fixtures to UI.
