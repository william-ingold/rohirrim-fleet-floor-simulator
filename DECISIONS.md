# Fleet Floor Simulator decisions

Status: core and selected modules A/B implemented. Brief ambiguity audit updated
2026-11-04; see the explicit resolution checklist at the end of this document.

Earlier planning-only statements, including D048, describe their original
session. Later implementation was separately authorized, as recorded in README.md
and the implementation results; those statements do not describe current status.

This document records scope decisions and interpretations of ambiguous
requirements. Architectural proposals and decisions are maintained separately in
[ARCHITECTURE.md](ARCHITECTURE.md). Proposals are not approved decisions. The
supplied brief is a requirements source; the handoff and layout contain prior
proposals.

Architectural rationale and implementation structure live in ARCHITECTURE.md;
this document also records the externally observable behavior and specification
interpretations arising from those choices. Together the two documents form the
decision record required by the brief.

## Confirmed decisions

### D001 — Required depth modules

Implement module A (pathfinding) and module B (battery and chargers). Evaluate
module C (timeline and fork) as stretch scope; it is not a committed deliverable.

Reason: confirmed by the user on 2026-10-31.

### D002 — Planning target

Aim for five hours of implementation. The user decides when to stop; the target
does not authorize an automatic stop or omission of required behavior.

Reason: confirmed by the user on 2026-10-31.

### D003 — Handling specification gaps

Resolve ambiguous or contradictory requirements through explicit, reasoned
interpretations discussed with the user. Record each chosen interpretation and
its rationale here, and test behavior that depends on it. Record architectural
decisions separately in ARCHITECTURE.md.

Reason: the user elected to make and document these decisions rather than seek
clarification from the evaluator.

### D004 — Backend framework

Use NestJS for the Node.js API.

Reason: the user explicitly clarified the framework name on 2026-10-31.

### D005 — World setup and edit permissions

Setting Up allows dimensions, robots, obstacles/chargers, and initial queues to
be prepared. Explicit Finish Setup validates and captures t0 and enters Paused.
Dimensions are fixed afterward. Paused allows placements, cell edits, queue
changes, and single-tick Step. Playing executes scheduled ticks and prohibits
edits. Later paused edits do not rewrite t0. Ended is read-only.

Reason: user-approved lifecycle rules fill gaps in the UI specification and make
the initial baseline explicit. See ARCHITECTURE.md, A001/A003/A004. CLI lifecycle
mapping and later FLOOR behavior were subsequently confirmed in D026/D027;
these lifecycle rules must not silently invalidate supported scenario input.

### D006 — Completion does not drain queues

CLI completion means end-of-file: execute only requested TICK directives and
REPORTs. Do not add ticks, drain or discard pending commands, or emit additional
reports. Interactive completion requires an explicit End action; empty queues
do not automatically end the world, since idle charging can still change it.

Reason: user-approved distinction between scenario directives and robot queues.
See ARCHITECTURE.md, A005.

### D007 — Re-placement preserves robot continuity

Valid PLACE of an existing robot updates its position and facing, preserves its
identity, battery, and queue, and resets an active GOTO's consecutive no-path
counter to zero. Preserve the GOTO target and recalculate from the new position
on its next tick. Invalid placement changes none of these properties.

Reason: user-approved interpretation; re-placement relocates an existing robot
rather than creating or resetting it. See ARCHITECTURE.md, A006.

### D008 — Contention losers are not reconsidered

Select the lowest numeric robot ID once per contested destination. Losing
contenders remain blocked even if the winner subsequently cannot move. Entry
into an occupied cell still requires its occupant to successfully leave.

Reason: user-approved reading of the ordered resolution rules; avoids repeated
allocation rounds. See ARCHITECTURE.md, A008.

### D009 — GOTO completion and consecutive no-path ticks

An already-at-target GOTO completes on its tick without executing the next queued
command. A found path resets the consecutive no-path counter even if movement
is subsequently blocked. Only a no-path result increments that counter; three
consecutive no-path ticks abandon the command and log UNREACHABLE.

Reason: user-approved interpretations preserve one-command-per-tick execution
and distinguish pathfinding failure from contention. See ARCHITECTURE.md,
A007/A009. Invalid placement does not reset the counter; valid re-placement does.

### D010 — Battery eligibility, cost, and charging order

Use start-of-tick battery for movement eligibility. Resolve movement, deduct one
for successful moves only, then charge robots ending on chargers by ten up to
100. Turning and blocked moves are free. Idle robots charge too. A robot with
zero battery on a charger must wait for end-of-tick charging before it can move
on a later tick.

Reason: user-approved ordering follows the end-of-tick charging rule. See
ARCHITECTURE.md, A010. The brief's 3 x 1 floor example therefore produces 98,
not its stated 97: two successful moves cost two, and the third hits a wall.
This consequence of the approved rules conflicts with the sample output; keep
the discrepancy explicit in implementation documentation and regression tests.

### D011 — Blocked GOTO retains its facing change

When GOTO finds a path, the robot turns to face the first step even if its
subsequent movement attempt is blocked. The facing change persists, while the
blocked move costs no battery. End-of-tick charging still applies if applicable.

Reason: the user confirmed that free turning is part of GOTO execution and is
not reversed by blocked movement. See ARCHITECTURE.md, A013.

### D012 — One current JSON snapshot includes robots and queues

Store complete current-world state as one minimal JSON value in SQLite,
including all robots, ordered queues, and active command progress. Keep history
outside that value. Do not introduce separate robot/queue tables initially.

Reason: user-approved choice fits whole-world tick processing and makes complete
restoration straightforward. The grid permits at most 400 placed robots; queues
and history have no stated length bound. Trade-offs are full-snapshot rewrites,
fewer relational constraints, and less convenient per-robot SQL querying. Split
storage if measured costs justify the added schema and reconstruction work.
See ARCHITECTURE.md, A015.

### D013 — Invalid scenario lines are ignored atomically

Reject an entire malformed or invalid scenario line without changing state,
then continue processing subsequent lines. For example, QUEUE R1 MOVE INVALID
LEFT appends nothing. Bad coordinates, unknown robot references, and illegal
placements must not crash the runner. Invalid lines do not emit REPORT output.

Reason: user-approved whole-line interpretation of the brief's invalid-line
rule. Validate before applying changes. Handle expected input errors without
masking unexpected engine or persistence failures. See ARCHITECTURE.md, A016.

### D014 — Append and Clear Queue

Allow appending and clearing a robot's queue during Setting Up or Paused. Clear
also cancels active GOTO and removes its progress; position, facing, and battery
are unchanged. Preserve existing command progress when appending. Individual
command removal and reordering are out of initial scope. No CLI CLEAR extension
has been selected.

Reason: user approved the small addition for flexibility. See ARCHITECTURE.md,
A016.

### D015 — GOTO is one command within a QUEUE line

Support QUEUE R1 MOVE GOTO 3,4 LEFT: GOTO consumes the following coordinate pair
as its argument and counts as one queued command. Missing/malformed arguments
or invalid coordinates reject the entire line. Preserve the brief's
case-insensitive input and blank/comment-line handling.

Reason: user approved this grammar. Rechecked the supplied brief, pages 2–5:
it specifies QUEUE Rn CMD [CMD ...] and names GOTO X,Y, but does not explicitly
show their combined syntax. This is our documented extension of CMD parsing,
not an additional top-level GOTO directive. See ARCHITECTURE.md, A017.

### D016 — GOTO validity differs from current reachability

Reject out-of-bounds GOTO targets. Accept in-bounds targets even when currently
occupied by another robot or an obstacle. Evaluate path availability on each
execution tick using the brief's walls/occupancy rules; three consecutive
no-path ticks abandon the command and log UNREACHABLE.

Reason: user approved separating invalid coordinates from valid but unreachable
destinations. Do not use present occupancy as an enqueue-time rejection rule.
See ARCHITECTURE.md, A017.

### D017 — Zero-battery moves do not enter contention

Exclude zero-starting-battery movement attempts before selecting destination
winners. Report NO_BATTERY and consume an ordinary MOVE. The robot's starting
cell remains occupied and blocks incoming movement unless it successfully leaves.

Reason: user confirmed that an ineligible move should not reserve a destination.
For example, positive-battery R2 may enter an empty cell also targeted by
zero-battery R1. See ARCHITECTURE.md, confirmed tick resolution rules.

### D018 — One primary blocked reason, with battery first

Report NO_BATTERY for zero-battery movement attempts even if geometry would
also block them. For eligible attempts, apply bounds/obstacles, contention,
head-on swaps, and occupancy dependencies in order. Use NO_BATTERY,
OUT_OF_BOUNDS, OBSTACLE, CONTESTED, HEAD_ON_SWAP, or OCCUPIED as the primary reason.

Reason: user approved deterministic single-reason precedence. See
ARCHITECTURE.md, confirmed tick resolution rules.

### D019 — Zero battery does not suspend GOTO processing

At zero battery, already-at-target GOTO completes normally; no-path GOTO advances
its failure counter; a found path resets that counter and updates facing before
the attempted movement is blocked NO_BATTERY. End-of-tick charging still applies.
An unfinished GOTO stays queued. No successor command runs on the same tick.

Reason: user approved per-tick GOTO processing despite movement ineligibility,
specifically including completion without moving. See ARCHITECTURE.md,
confirmed tick resolution rules.

### D020 — Atomic durable world changes

For each state-changing action, use one short BEGIN IMMEDIATE transaction to
load the latest state, calculate its transition, save the current snapshot and
new revision, and append history. Finish Setup captures t0 in the same
transaction. Return success or expose the resulting world only after commit.
Serialize actions per world and avoid overlapping automatic ticks.

Reason: user approved atomic persistence so state and its history cannot diverge.
SQLite is authoritative; the pure engine has no database dependency. See
ARCHITECTURE.md, confirmed persistence transactions and history.

### D021 — Append-only audit history and revision ordering

Keep one append-only history record per committed state-changing action with
world identity, revision, tick, timestamp, action/arguments, and effects. Each
tick includes every robot's outcome, including idle robots. Record lifecycle
changes and queue clears as well as the changes explicitly required by the brief.
Do not duplicate a full world snapshot in every entry.

Revision orders all committed changes; tick counts simulation advances only.
Invalid actions and true no-ops do not generate change history or a new revision.
Idle ticks still advance time and are recorded. Restore from the current snapshot;
history is not selected as the authoritative event-sourced state.

Reason: user approved append-only history. The brief requires retained/displayed
world-change history but does not explicitly prescribe append-only storage.
This design supplies that property; historical replay/module C remain separate.

### D022 — Surface persistence failures without partial changes

On calculation or persistence failure, roll back when possible, surface an
error, and retain the last committed world. Do not consume robot commands only
in memory. Stop automatic scheduling after a failed tick rather than repeatedly
attempting it. Do not claim a persisted Paused transition if the database is
unavailable. Reload durable state before resuming; reconcile uncertain commit
outcomes before retrying rather than blindly applying the action twice.

Reason: user explicitly requires surfaced errors and no world changes on failed
persistence. Integration tests must cover restoration, rollback if history
insertion fails, and preservation of queues after a failed tick. Detailed API
errors and retry/idempotency mechanisms remain open.

### D023 — Server restart requires explicit playback resumption

Restore Playing worlds as Paused after server restart. Preserve logical tick,
robots, queues/GOTO progress, battery, t0, and prior history. Retain Setting Up,
Paused, and Ended states as saved. Record recovery to Paused as a new lifecycle
history entry and revision in the same transaction as the updated snapshot.
Require successful recovery persistence before mutations or playback resume.
A browser refresh alone does not trigger this server-restart policy.

Reason: user approved explicit resumption after restart. Durable recovery follows
the agreed atomic history/state contract; it does not reset or fork the run.
See ARCHITECTURE.md, A018.

### D024 — Pause occurs only between complete ticks

Let an executing tick commit or fail before processing Pause. A successful
Pause commits its lifecycle change and history before returning a stable world
for editing. Cancel future scheduling and reject stale automatic tick callbacks
that execute after the world is Paused. These callbacks must not advance time,
consume commands, or create tick history. Explicit manual Step remains allowed.

Reason: user confirmed that ticks cannot be interrupted. Serialize actions and
recheck the authoritative lifecycle at execution time; timer cancellation alone
cannot establish this guarantee. Tick/Pause save failures follow D022.
See ARCHITECTURE.md, A019.

### D025 — End from Paused/Playing; Cancel during setup

Allow End from Paused or Playing, only between complete ticks. Commit the Ended
lifecycle and its history before reporting success. Stop automatic scheduling;
stale callbacks and manual Step cannot advance an Ended world. Preserve its
final snapshot and pending queues for read-only inspection. Ended is terminal;
reopening/resetting it is not selected.

Setting Up uses a separate Cancel action because t0 has not been finalized.
Retaining/archiving cancelled drafts was later rejected as unnecessary scope.
Simple unfinished-setup disposal is recommended; exact persisted-record cleanup
remains to be specified. User subsequently approved discarding unfinished setup
(D037). Do not add a Cancelled state or archival/recovery UI.

Reason: user approved the lifecycle permissions and preservation behavior.
See ARCHITECTURE.md, A020. Persistence failures follow D022.

### D026 — CLI adapts the lifecycle without additional syntax

Each invocation creates an isolated in-memory Setting Up world, default 5 x 5,
using the same engine as the API. It does not require an HTTP server or modify
the interactive SQLite world. Placement, cell, and queue directives edit the
draft or Paused world. REPORT variants inspect without advancing time or
finishing setup. The first valid TICK implicitly finishes setup and captures t0,
then executes its requested manual Steps. Later ticks remain Paused; no timer
or Playing transition is needed. Invalid lines do not trigger transitions.

At end-of-file, finish setup if needed and End without adding ticks, draining
or discarding queues, or printing an unsolicited final report. No FINISH SETUP,
PLAY, PAUSE, or END directive is required. Do not infer inline-comment support
from documentation examples; the brief specifies comment lines.

Reason: user approved mapping the mandatory scenario syntax onto our lifecycle
while retaining shared simulation semantics. See ARCHITECTURE.md, confirmed CLI
lifecycle mapping.

### D027 — FLOOR replaces only an unfinished scenario draft

A valid FLOOR directive during Setting Up replaces the draft with an empty floor
of the requested dimensions, clearing robots, obstacles, chargers, and queues.
After Finish Setup (implicitly the first valid TICK in the runner), ignore FLOOR
without changes. Invalid FLOOR also leaves state unchanged.

Reason: user approved this interpretation of unspecified repeated-FLOOR behavior.
It preserves fixed dimensions after t0 and limits replacement to the isolated
CLI draft. It does not authorize deleting persisted worlds or prior history.
See ARCHITECTURE.md, confirmed CLI lifecycle mapping.

### D028 — One action endpoint for API mutations

Use a single world-action endpoint rather than separate mutation endpoints for
every robot, cell, queue, and playback operation. Route typed action requests
through the application service and engine; controllers do not duplicate domain
rules. Read/create/history routes and response details remain proposed.

Reason: user explicitly preferred manageability. Latest-state execution is
confirmed in D029. The user challenged polling and selected HTTP + SSE in D030.
See ARCHITECTURE.md, HTTP API contract and discussion record.

### D029 — Execute all actions against latest committed state

Do not require expectedRevision or reject an action merely because the client
view is old. Validate and apply each action against the latest committed world
inside the serialized transaction. Continue enforcing lifecycle, placement,
queue, and all other engine rules; reject actions that are currently illegal.
Clients submit actions, not replacement world snapshots.

Reason: user explicitly chose latest-state execution after clarification of the
stale-edit-check alternative. This avoids revision mismatches blocking actions,
at the cost of accepting a valid action against state the user may not yet have
seen. Revisions still order history and deduplicate/recover UI updates. This is
not request retry idempotency. See ARCHITECTURE.md, HTTP API contract.

### D030 — HTTP actions and SSE server-push updates

Keep the HTTP action endpoint as the mutation transport and use SSE for live
server-to-browser world updates. Do not use periodic polling as the primary
update mechanism or add a duplicate WebSocket command transport. Publish world
updates only after commit; stream delivery failure does not undo committed state.

Reason: user asked why polling rather than server-push, then whether two-way UI
favored WebSockets. Compared HTTP+SSE with bidirectional WebSockets and selected
HTTP+SSE for controllability and fit within the time scope. Exact stream payload,
subscription/reconnect protocol, and event/error types remain open. Revisions
remain useful for ordering and deduplication despite latest-state action handling.
See ARCHITECTURE.md, HTTP API contract and discussion record.

### D031 — WSL/Linux development and Unix evaluation assumption

Develop on WSL/Linux. Plan for a latest/recent Node.js release and a Unix-based
evaluation environment, as authorized by the user. Evaluator runtime support is
assumed, not independently verified; native Windows compatibility is not a
selected requirement. Exact Node version and SQLite driver were subsequently
confirmed in D032; see ARCHITECTURE.md, runtime and SQLite tooling.

Reason: user clarified the environments before driver selection, removing the
need to optimize for native Windows installation in the initial tooling choice.

### D032 — Node pin, SQLite driver, and SQL migrations

Pin Node.js 26.13.0. Use better-sqlite3 with prepared SQL statements and versioned
SQL migrations tracked by schema_migrations. Do not add an ORM initially. Apply
migrations transactionally and fail startup on migration failure. The broad
schema consists of worlds (current JSON, revision, schema version, t0),
world_history, and schema_migrations; detailed SQL definitions remain open.

Reason: user explicitly preferred a stable/mature SQLite library and approved
all proposed tooling. Compared the built-in node:sqlite API (currently release
candidate) and Drizzle (additional schema/query tooling with limited benefit
for this small snapshot-based design). better-sqlite3 adds a native dependency;
verify installation on the selected Node/Unix environment during scaffolding.
See ARCHITECTURE.md, runtime and SQLite tooling, for sources and trade-offs.

### D033 — Snapshot, baseline, history, and migration constraints

Keep one worlds row per world with a required current snapshot. Store t0 as null
until Finish Setup, then preserve it immutably for that run. world_history
references its world and uniquely identifies records by (world_id, revision).
schema_migrations records each applied migration once.

Validate saved snapshot structure and domain invariants when loading. Surface
invalid saved state as an error rather than silently resetting or replacing it
with defaults. Exact SQL constraints and validation implementation remain open.

Reason: user approved these safeguards for restoring complete state, preserving
the baseline, and preventing duplicate history. See ARCHITECTURE.md, confirmed
schema constraints.

### D034 — Test tools and behavioral coverage

Use Vitest for engine and CLI tests; Jest with Supertest for Nest API/persistence
integration tests; Vitest with Testing Library for Svelte UI tests. Include SSE
connection/recovery coverage at the API boundary and UI response to stream updates.

Cover engine rules beyond supplied examples, exact scenario output and invalid
line recovery, transaction rollback and restart restoration, lifecycle/UI action
restrictions, and immutable transitions. Explicitly verify iteration-independent
tick resolution, queue preservation after failed persistence, and authoritative
state recovery after stream reconnect.

Reason: user approved this split following the Jest/Vitest trade-off discussion.
Exact dependency versions, transforms, fixture details, and command orchestration
remain for setup. See ARCHITECTURE.md, confirmed testing strategy.

### D035 — Snapshot-based SSE synchronization

Send the complete current snapshot on stream connection and revision-tagged
snapshots after committed changes. Ignore old/duplicate revisions. Reconnect
resynchronizes current state and fetches missing history. Server state remains
authoritative; the browser does not independently advance simulation state.

Reason: user agreed to synchronization/recovery, but challenged the accompanying
proposal that playback continue after all clients disconnect. That unattended
playback behavior is not selected. Heartbeat/last-client auto-pause is confirmed
in D036; exact stream protocol remains open.

### D036 — Pause playback when the last client lease expires

Use server-managed transient client leases associated with SSE subscriptions.
Browsers renew through HTTP heartbeats every 5 seconds; leases expire 15 seconds
after their last renewal. Continue playback while at least one lease is live.
When all expire, finish any in-progress tick, then atomically persist Paused and
its history with a no-clients reason. Recheck presence before scheduled ticks.

Reconnect/refresh within the lease window does not itself pause playback.
After auto-pause, reconnect restores Paused and explicit Play is required.
Presence traffic does not change logical time, revision, world snapshot, or
domain history. Actual auto-pause is a normal recorded lifecycle transition.
Stream-close detection assists cleanup; outbound SSE writes alone do not prove
application liveness. Keep presence clocks outside the pure engine.

Reason: user rejected unattended playback and approved the 5-second/15-second
heartbeat proposal. Grace tolerates brief reconnects, at the cost of bounded
continued playback until lease expiry, assuming the server can process timers.
Detailed heartbeat route/registration is still open. Persistence failure follows
D022; CLI execution is independent of browser leases.

### D037 — Discard cancelled setup without retention features

Cancel discards unfinished setup and returns to world creation. Do not add draft
archival, recovery UI, or a Cancelled lifecycle state. Finalized worlds are
unaffected. Exact transactional cleanup of persisted draft records remains an
implementation detail to define consistently with the history policy.

Reason: user challenged draft retention as out of scope, then explicitly agreed
to simple disposal. See ARCHITECTURE.md, A020 and discussion record.

### D038 — Scenario integer grammar

Accept decimal digit integers, not signs, fractions, or exponent notation.
Dimensions are 1..20; coordinates are nonnegative and in bounds. TICK counts
are positive safe integers; omitted count means 1. Invalid TICK, including zero,
does not advance time or implicitly finish setup. Reason: user approved explicit
numeric rules before implementation.

### D039 — Canonical robot identity and automatic allocation

Use positive safe-integer numeric robot IDs with case-insensitive R prefix.
Normalize leading zeros (r01 identifies R1); reject R0. UI placement assigns the
smallest unused positive ID. Reports and contention use numeric ordering.
Reason: user approved deterministic allocation and alias normalization.

### D040 — Scenario whitespace and comments

Trim lines; accept spaces/tabs between tokens and around commas. Input keywords
and facing values are case-insensitive. Ignore lines whose first non-whitespace
character is #. Inline comments and unknown trailing tokens invalidate the whole
line. Reason: user approved this explicit parser interpretation.

### D041 — No-path GOTO preserves facing

If GOTO finds no path, preserve facing and update no-path progress as agreed.
No movement battery is consumed; normal end-of-tick charging still applies.
Commands behind the front neither execute nor accumulate GOTO progress.
Reason: user approved avoiding a facing change when no first path step exists.

### D042 — Independent obstacle and charger features

Allow obstacle and charger on the same cell. Obstacles still prevent entry;
removing one feature preserves the other. Charger edits never charge robots
immediately; charging occurs only at tick end. Reason: user approved the brief's
any-cell charger interpretation and independent feature behavior.

### D043 — Interactive setup resize preserves contents

Preserve contents when resizing during Setting Up. Reject the entire operation
if a robot, obstacle, charger, or queued GOTO target would be out of bounds.
Do not clip or delete contents. After Finish Setup, dimensions remain fixed.
This differs explicitly from CLI FLOOR draft replacement (D027). Reason: user
approved preserving interactive configuration and atomic resize rejection.

### D044 — Atomic disposal of cancelled drafts

Cancel deletes the entire unfinished persisted draft and associated setup history
in one transaction. Return to creation only after successful commit; failure
surfaces an error and leaves the draft intact. Finalized worlds cannot be
cancelled. Whole-draft disposal is an explicit exception to retaining history;
history of retained worlds remains append-only, with no individual entry editing.
Reason: user approved concrete cleanup for the earlier discard decision (D037).

### D045 — Runner invocation and filesystem failures

Missing/unreadable scenario files and invalid invocation produce a readable
stderr error and nonzero exit. Do not treat them as empty successful scenarios.
Invalid lines inside a readable file are ignored and do not themselves make
otherwise successful execution fail. Reason: user approved distinguishing runner
failures from the brief's recoverable invalid scenario lines.

### D046 — API responses and SSE synchronization contract

Successful actions return worldId, revision, full committed state, and only new
historyEntries. Errors use error.code/error.message and the proposed HTTP status
mapping. No-op responses retain revision with empty new history. Use the
read/create/action/history routes plus SSE events and HTTP presence renewal.

SSE emits stream.ready with a transient subscriptionId, world.snapshot for
initial/reconnected state, and world.updated for committed changes including
full state/new history. World events use revision IDs. Process connection
metadata even when the accompanying state revision has already been seen.

Register/buffer subscribers before obtaining the initial snapshot, then deliver
only newer revisions in order. Do not keep a database transaction open while
streaming. Reconnect creates a new subscription and sends current state rather
than replaying animations. Fetch missing history separately by revision and
deduplicate records. No historical snapshot replay is promised.

Heartbeats renew the current subscription's lease using subscriptionId and
return latest revision; old subscriptions cannot be revived. Revision gaps can
trigger resynchronization. Do not blindly retry mutations after ambiguous
transport failures; reload state first because enqueue/Step may have committed.

Reason: user approved all six API/SSE contract choices. Exact DTO field types,
page limits, and slow-client buffer thresholds remain implementation details.
See ARCHITECTURE.md, confirmed API/SSE wire contract.

### D047 — Final frontend, lifecycle implementation, and workspace choices

Use Svelte + Vite with plain/component CSS, without SvelteKit. Implement the
World lifecycle through a TypeScript transition table and guards, without a
state-machine library. Use npm workspaces with apps/api, apps/web,
apps/scenario, and packages/engine, one root lockfile, and the mandatory root
scenario command. Keep framework/persistence outside the shared pure engine.

Reason: user explicitly confirmed all three remaining proposals after resolving
behavior and API/SSE contracts. This closes the pre-implementation architecture
review. Exact dependency versions and package/build configuration must be
verified during scaffolding. See ARCHITECTURE.md, A021–A023.

### D048 — This chat produces implementation designs and handoffs only

Do not implement or scaffold the application in this chat. Produce phased
implementation plans, separate backend/frontend work breakdowns, agent prompts,
and an AI UI/UX design prompt. Use TDD, restrained DDD, spec traceability, and
BDD examples where they improve correctness and ownership, without ceremonial
framework additions. Start at HANDOFF.md for the resulting package.

Reason: user explicitly clarified the session's intended output after approving
the architecture. Readiness to implement is not permission to start coding here.

### D049 — Bright educational workbench; coding-agent/design-tool handoff

Use a bright simulation workbench direction: approachable, clear, educational.
Implementation prompts primarily target coding agents; an AI design tool will
propose colors, animations, effects, and their handoff specification. Exact HEX
values, fonts, timings, layouts, and visual artifacts remain proposals until
reviewed. Do not label unproduced mockups or speculative accessibility as verified.

Reason: user answered the design-direction and target-tool questions. See
docs/handoff/prompts/UI_UX.md and the frontend handoff.

### D050 — Cancel returns a 200 cancellation receipt

After the approved atomic draft deletion commits, CANCEL returns HTTP 200 with
`{worldId, cancelled: true}`. This is an explicit exception to the ordinary
world-state success envelope: the deleted draft is not returned as current state.
Return to creation only after commit; a subsequent GET returns 404. Failed
disposal follows D044 and does not return a success receipt.

Reason: on 2026-11-01, the user selected the proposed 200 receipt after comparing
it with 204 No Content. This resolves R1's response question without changing
the confirmed disposal behavior or adding a retained Cancelled state.

### D051 — Playback speed selection and scheduler ownership

Each browser tab starts with a local selection of 1000ms per tick. Allow the
selection to change during Setting Up or Paused and pass it as `tickIntervalMs`
on PLAY. The server scheduler holds the running interval outside durable
simulation state. Refresh resets that tab's selection to 1000ms; different tabs
may have different selections. Existing server-restart recovery remains D023.

Reason: on 2026-11-01, the user agreed to the proposed ownership, default, and
refresh-reset behavior after discussion of independent tab selections and
simpler persistence. Range and numeric validation were subsequently confirmed
in D052. Repeated-PLAY behavior was subsequently confirmed in D055.

### D052 — Playback interval range and validation

Accept `tickIntervalMs` only as a whole-number millisecond value from 100 through
5000 inclusive, enforced by both UI and API. Reject values outside that range
or fractional values. This permits selections from ten ticks per second to one
tick every five seconds; it is a scheduler interval, not a measured throughput
guarantee. The default remains 1000ms under D051.

Reason: on 2026-11-01, the user approved this range and validation after comparing
useful fast/slow playback with the flexibility of broader limits. Together with
D051, this resolves R2 without adding timing to durable simulation state.

### D053 — One API process; scaling and high availability outside scope

Support one running Nest API process, owning the per-world action serializer,
schedulers, SSE publisher/subscriptions, and presence registry. Multiple browser
clients remain supported. Do not add API replicas, distributed locks, or a
coordination broker for this scope. Existing SQLite durability and server-restart
recovery requirements remain in force.

Reason: on 2026-11-01, the user explicitly stated that scaling and availability
are not needed and chose one process. This resolves R3; it does not remove
confirmed persistence, failure handling, or restart recovery behavior.

### D054 — Reject unsupported snapshot versions without changing saved data

When loading an unsupported saved snapshot version, surface a clear
unsupported-version error and leave the saved data untouched. Do not silently
reset worlds or attempt automatic JSON format conversion. No world-format
change is planned. If one is introduced later, support for upgrading existing
JSON requires an explicit migration. Confirmed versioned SQL schema migrations
remain in force.

Reason: on 2026-11-01, the user agreed to rejection rather than automatic
conversion and clarified that changing the world format is not planned. This
resolves R4 without adding speculative format-migration work or weakening saved
state validation (D033). Exact error vocabulary was subsequently confirmed in D059.

### D055 — Repeated lifecycle actions return unchanged state

PLAY while Playing, PAUSE while Paused, and END while Ended return HTTP 200
with the current committed state, unchanged revision, and empty new
historyEntries. They create no duplicate scheduler loop or history. Repeated
PLAY leaves the running interval unchanged. Existing lifecycle restrictions
otherwise remain in force, including rejecting edits to Ended worlds.

Reason: the user approved these three rules after comparison with 409 responses
for redundant requests. They tolerate duplicate clicks and actions already
performed by another tab. This resolves the repeated-action part of R5 only;
it does not authorize blind retries of STEP or ENQUEUE or change their effects.

### D056 — Creation starts at revision 1 with an atomic CREATE record

Create a Setting Up world at revision 1 and tick 0. Commit its initial snapshot
and CREATE history entry together in one transaction. Keep t0 null until Finish
Setup captures the baseline under the existing lifecycle rules. A history query
after revision 0 can therefore retrieve the complete retained history beginning
with creation.

Reason: the user agreed to auditing creation as the first change after comparing
it with revision 0 without a creation record. This resolves the initial
revision/history portion of R5; final boundary approval is recorded in D060.

### D057 — Close cancelled-draft streams and confirm deletion through GET

After draft deletion commits, close that world's SSE streams and invalidate its
subscriptions. On stream loss, a browser checks the world through GET. A 404
stops reconnection and returns to creation with "This draft is no longer
available." Network or server failures show a connection error without assuming
deletion. The cancelling tab still follows the committed 200 receipt under D050.

Reason: the user agreed to using the existing GET/404 contract after comparison
with a dedicated cancellation event, which would still need a missed-delivery
fallback. This resolves draft-stream shutdown under R5 without adding a new
cancellation event or changing the approved disposal transaction.

### D058 — Surface scheduler failure as operational status

When an automatic tick fails, stop scheduling under D022 and notify connected
tabs through SSE with a readable error and a status indicating that scheduling
stopped. Reconnecting tabs also receive the current operational status. The UI
shows "Playback stopped due to an error" while preserving the last committed
world lifecycle, revision, and history. Do not claim a Paused transition that
has not committed; operational status is separate from saved simulation state.

Reason: the user approved this approach after comparison with HTTP errors
alone, which would not directly notify browsers of automatic tick failures.
This resolves the failure-notification approach under R5. Exact event/payload
vocabulary was subsequently confirmed in D059; D022's reconciliation and
recovery requirements are unchanged.

### D059 — Scheduler error event and failure codes

Use SSE event `scheduler.error` with payload `{worldId, error: {code, message}}`
and no event ID. It reports an operational failure without advancing revision.
Use `PERSISTENCE_UNAVAILABLE` for temporary database failures and
`INTERNAL_ERROR` for unexpected internal failures. Unsupported saved snapshot
formats return HTTP 500 with `UNSUPPORTED_SNAPSHOT_VERSION`, leaving data
untouched under D054. D058's current-failure delivery on reconnect applies.

Reason: the user approved these names and shapes after comparison of a dedicated
unsupported-version code with a generic internal error and reuse of the existing
error shape. This resolves the operational event and these error identifiers
under R5; remaining DTO/SQL vocabulary was subsequently approved in D060.

### D060 — Approve boundary vocabulary and table design; close R5

Approve the documented snapshot fields and WorldResponse envelope, including
`snapshotVersion` as envelope metadata; world-action names/payloads and six API
routes; creation HTTP 201 and ordinary reads/actions HTTP 200; history cursor
and response fields; and presence response fields in docs/handoff/CONTRACT.md.
Approve `INVALID_REQUEST` (400), `WORLD_NOT_FOUND` (404), `INVALID_LIFECYCLE`
(409), and `INVALID_PLACEMENT` (422), alongside the D059 failure codes.

Approve the documented worlds, world_history, and schema_migrations table
design and columns, JSON checks, foreign key, and unique world/revision history
key. Preserve the confirmed single current-world JSON snapshot, separate t0,
atomic writes, and draft-disposal exception to append-only history.

Reason: the user approved the remaining DTO/SQL vocabulary and table design
after review of the shared-contract benefit and the existing JSON storage
trade-offs. Together with D055–D059, this resolves R5 and freezes the documented
boundary. R1–R5 are all resolved. Exact SQL syntax, database pragmas, dependency
versions, and bounded transport defaults remain implementation details within
confirmed behavior. Undocumented input limits or behavior changes are not
authorized. Planning-only scope (D048) remains in force.

### D061 — Expose the running tick interval as transport metadata

Add `runningTickIntervalMs` (integer, or null when no scheduler is running for
the world) to WorldResponse, `world.snapshot`, and `world.updated`, outside
WorldSnapshot. It is not persisted and adds no SQL column. The tab's local
selection stays per D051/D052 and is shown separately as the next Play interval.
Repeated PLAY leaves the value unchanged (D055). The `scheduler.error` payload stays as
approved in D059; a client treats that event as null. Reconnecting tabs read
the current value from their initial snapshot.

Reason: on 2026-11-01, the user chose to show the running interval during design
review and agreed to this proposal. It amends D051's display limits and the
frozen boundary; ownership, range, and simulation behavior do not change.

### D062 — Pause is the recovery path after scheduler failure

After `scheduler.error`, the committed lifecycle remains Playing and PLAY stays
an unchanged-state no-op (D055), so the UI offers Pause and End, not Play. PAUSE
follows its existing legal transition and commits normally. If persistence is
still unavailable, it returns the error and nothing changes (D022). A committed
Pause or End clears the stopped operational status. After Pause, ordinary PLAY
starts scheduling again. No action, route, or error code is added.

Reason: on 2026-11-01, the user agreed after the design review found that no
recovery step had been named for D058. D022's reconciliation requirements remain.

### D063 — Approve the bright workbench visual specification

Approve docs/handoff/design/UI_UX_SPEC.md and workbench-design.html as the
visual specification: Bright Daylight palette (Quiet Daylight not selected),
system fonts, lifecycle track, robot marker, three-column layout, cell sizes,
motion tiers and timings, speed control, messages, arrow-key queueing with a `C`
floor cursor, grid lines below 3:1, no misplaced-robot fix beyond Cancel, and a
Create another world link on Ended. History receives its own scrolling panel
with at least 320px of height. No mouse-drag command input is added.

Reason: on 2026-11-01, the user reviewed and accepted these choices, resolving
D049's open proposals. Accessibility and performance remain unverified until
tested in the implemented UI. Planning-only scope (D048) remains in force.

### D064 — Use the approved design materials in phase 5 frontend sessions

docs/handoff/prompts/UI_UX.md has served its purpose; reuse it only if the design
is redone. Every phase 5 slice uses UI_UX_SPEC.md as its main visual source and
workbench-design.html as its visual reference, focusing on the sections and frames
relevant to that slice. The setup and grid slice turns the spec's token block into
CSS variables, which later slices reuse rather than copying values. The user
compares each built slice against the frames. Backend sessions do not need the
design files; B5 receives D061/D062 through CONTRACT, BACKEND, and ACCEPTANCE.

Reason: on 2026-11-01, the user asked when and where the design materials and
prompt are used, then asked to record the answer. This sets how the materials are
used; it does not authorize implementation (D048 still applies to this chat).

## Discussion provenance

[ARCHITECTURE.md](ARCHITECTURE.md) contains a retrospective discussion record of
the user's questions, requests for justification, objections, and how choices
changed. This includes the setup/t0 distinction, JSON size and robot storage,
Jest/Vitest recommendation correction, required grammar recheck, and polling
pushback. Entries are paraphrases; open questions are not approved decisions.
Maintain that record alongside future decisions.

## Requirements from the brief

Architectural choices are recorded in [ARCHITECTURE.md](ARCHITECTURE.md), including
immutable Robot/Command instances (A011) and a shared Command interface without
an abstract base class (A012). These guide implementation; behavior and
specification interpretations are recorded above.

- A component-based frontend, a Node.js API, and SQLite persistence.
- A pure simulation engine shared by the API and scenario runner.
- Root invocation: `npm run scenario -- path/to/scenario.txt`.
- Durable full floor state and history of world changes.
- Engine unit tests beyond the supplied examples, custom scenarios, and at least
  one API or integration test.
- UI floor default: 10 x 8. Scenario runner default: 5 x 5.

## Implementation details to finalize within confirmed decisions

- Test configuration and versions (runner split and coverage confirmed in D034).
- Remaining engine interfaces, movement resolver details, and outcome types
  (see ARCHITECTURE.md for confirmed ownership and propose/resolve protocol).
- Exact transition-table types and transactional SQL for the confirmed setup
  Cancel disposal (D044/D047); no draft retention feature.
- Exact snapshot/history schema and database connection options (SQLite driver,
  migration approach, atomic transaction boundary, revision ordering, and
  append-only history are confirmed).
- Package build/export configuration in the confirmed workspace structure; exact DTO types and
  transport limits within the confirmed API/SSE contract.

### D065 — Setup robot removal and immediate facing controls

Support `REMOVE_ROBOT {robotId}` and `SET_ROBOT_FACING {robotId, facing}` only
during Setting Up, enforced by World and the API as well as the UI. The user
explicitly selected Setup-only immediate facing changes on 2026-11-01.
The selected-robot inspector offers North/East/South/West and Delete robot.
Existing queued Left/Right commands retain their tick-based behavior.

Removal discards the robot and its queue, preserving floor features, other
robots, and append-only history. Existing smallest-unused-ID allocation applies
to subsequent placement; a reused ID starts with a fresh battery and queue.
Unknown robots reject either action. Facing changes preserve position, battery,
queue, and GOTO progress; selecting the current facing is a no-op. Finish Setup
captures the resulting configuration. Neither action advances a tick.

Implementation decision: use distinct world actions so a facing edit does not
invoke re-placement's GOTO-progress reset. Both use the existing atomic
snapshot/history transaction and committed-update publication. No snapshot/SQL
format change or CLI directive is required. UI changes follow committed state,
disable during pending/disconnected states, and clear a deleted selection.

### D066 — Phase 6 corrections and isolated verification

The phase 6 review on 2026-11-01 preserves the approved lifecycle and transport
contract. A newer committed Playing view with a non-null running interval clears
a tab's obsolete scheduler-error flag: another tab may have completed Pause/Play
while this one was disconnected. Same-revision responses cannot erase the error,
and the client never sends an automatic Play. This implements D058/D061/D062;
it introduces no new recovery policy.

Floor-cell Enter/Space activation obeys the same repeat and Alt/Ctrl/Meta guards
as cursor and command shortcuts. Shift remains available for GOTO. A regression
showed that bypassing those guards appended unintended commands; the correction
implements the already-approved keyboard behavior rather than changing it.

Browser review can select two free ports through FLEET_TEST_API_PORT and
FLEET_TEST_WEB_PORT, retaining 3000/5173 defaults. Tests start their own servers
and temporary database, so validation need not stop or reuse existing services.
FLEET_TEST_SCREENSHOTS optionally separates new captures from prior evidence.
Original supplied scenario files remain untouched; real CLI process tests compare
all five against independently transcribed expected reports. See Phase 6 results
for actual red/green evidence and validation limits.

## Brief contradiction and ambiguity resolution checklist

Reviewed 2026-11-04 against [the supplied brief](docs/handoff/reference/BRIEF.md),
the implementation, and executable tests. This checklist indexes existing
decisions; it introduces no new simulation behavior or approval claims. The
battery sample is a direct contradiction. The two defaults are context-specific,
and the other entries resolve unspecified details or interactions between rules.

### Floor, identity, queues, and scenario input

| Brief reference and question | Explicit resolution | Decision record |
| --- | --- | --- |
| Core 1.1 vs. 1.5: is the default 10 × 8 or 5 × 5? | Interactive creation defaults to 10 × 8; each CLI invocation starts with 5 × 5. | Requirements from the brief; D026 |
| Core 1.2: what is the next free ID, and are R01 and R1 distinct? | Allocate the smallest unused positive ID. Normalize case and leading zeros; require positive safe-integer IDs. Contention and reports compare numeric IDs. | D039 |
| Core 1.5 PLACE: does relocating an existing robot reset it? | Preserve identity, battery, and queue; update position/facing and reset active GOTO no-path progress. Invalid placement changes nothing. | D007 |
| Core 1.1/1.2: what does an ignored illegal placement mean across interfaces? | No world change. CLI ignores the invalid line and continues; HTTP returns an explicit error, and the UI retains committed state and explains the rejection. | D013, D046, D060 |
| Core 1.5: does a partially valid QUEUE line partially append? | Validate and reject the entire line atomically; no valid prefix is appended. | D013 |
| Core 1.5: which numbers, whitespace, and comments are accepted? | Decimal digit integers; dimensions 1..20; coordinates in bounds; positive safe-integer TICK counts. TICK 0 is invalid. Accept spaces/tabs around commas and whole-line comments; reject inline comments/trailing junk. | D038, D040 |
| Core 1.5: what does a repeated FLOOR do? | Replace and clear an unfinished CLI draft. After the first valid TICK, ignore FLOOR. Interactive setup resize instead preserves contents or rejects the entire resize, including invalidated queued GOTO targets. | D027, D043 |
| Core 1.5: how do REPORT, first TICK, and EOF interact with setup and queues? | REPORT only observes. First valid TICK captures t0 and steps. EOF finishes/ends without extra ticks, queue draining, or unsolicited reports. Invalid lines do not finish setup. | D006, D026 |
| Module A: how does GOTO fit QUEUE syntax? | Accept `QUEUE R1 MOVE GOTO 3,4 LEFT`; GOTO plus its coordinate pair is one command. No top-level GOTO directive. | D015 |

### Simultaneous movement, GOTO, and battery

| Brief reference and question | Explicit resolution | Decision record |
| --- | --- | --- |
| Core 1.3: is contention rerun if its winner cannot leave/move? | Select the lowest eligible numeric ID once. Losers remain blocked even if the winner subsequently fails occupancy or swap checks. | D008 |
| Module A vs. core 1.3: does every tick remove GOTO, and can its successor run immediately? | GOTO remains at the head until arrival or abandonment. Already-at-target completion consumes its tick; no successor executes on that tick. | D009 |
| Module A: are occupied/obstacle targets invalid at enqueue time? | Reject out-of-bounds targets; accept in-bounds targets even if currently unreachable. Other robots' starting cells remain pathfinding walls even when they will move this tick. | D016; module A's explicit starting-occupancy rule |
| Module A: does a contention-blocked path count toward three no-path ticks? | Only a failed path search increments the counter. A found path resets it even when movement is blocked. Third consecutive no-path tick drops GOTO and records UNREACHABLE. | D009 |
| Module A: what facing remains after blocked movement or no path? | A found path's free facing change persists after blocked movement. With no path, facing stays unchanged. | D011, D041 |
| Module B: the 3 × 1 example prints 97, but its third MOVE hits a wall. | Follow the written successful-moves-only cost rule: battery is **98**. Deliberately differ from the printed 97; preserve this exception in documentation and regression tests. | D010 |
| Module B: can charging enable a move during the same tick, and do idle robots charge? | Movement uses starting battery. Deduct successful movement cost, then add 10 on the ending charger cell, capped at 100. Idle, turning, and blocked robots charge too; feature edits never charge immediately. | D010, D042 |
| Module B vs. core 1.3: can a zero-battery robot win contention? | Exclude its movement before contention. Its starting cell still blocks incoming robots. Ordinary MOVE is consumed with NO_BATTERY. | D017 |
| Core 1.3/module B: which reason wins when multiple rules block a move? | One primary reason: battery first, then bounds/obstacles, contention, swaps, and occupancy dependencies. | D018 |
| Modules A/B: does zero battery suspend GOTO or make it unreachable? | Continue planning: at-target completes; no-path increments its counter; a found path resets progress and changes facing before NO_BATTERY blocks movement. Unfinished GOTO stays queued. | D019 |
| Module B: can a charger coexist with an obstacle? | Features are independent and may overlap. Obstacle still blocks entry; removing either preserves the other. | D042 |

### Lifecycle, persistence, and scope

| Brief reference and question | Explicit resolution | Decision record |
| --- | --- | --- |
| Core 1.1–1.4: when are edits legal, and do empty queues end playback? | Setup/Paused allow edits; Playing requires Pause before edits; Ended is read-only. Finish Setup captures immutable t0. Empty queues do not end a run because idle charging may still change it. | D005, D006, D025 |
| Core 1.4: what is retained, and are rejected/no-op actions history? | Persist full state, including battery and GOTO progress. Atomically commit snapshot and one revision-ordered action/history record, with every robot's tick outcome. Rejections and true no-ops add no revision/history; idle ticks do. | D012, D020, D021, D033 |
| Core 1.4: what happens after a failed save or server restart? | Roll back failed changes without consuming queues; stop failed scheduling and surface an error. Restart durably pauses Playing worlds and records recovery; explicit Play is required. | D022–D024, D058, D062 |
| Core 1.3/module D: who owns timers, and what happens when tabs disconnect? | One API process owns one loop per world. Browser refresh does not start another loop. Last-client lease expiry persists Pause; leases last 15 seconds from their last renewal, allowing brief reconnects within the remaining grace period. | D030, D035, D036, D053, D055 |
| Core 1.3: what playback interval is allowed and retained? | Per-tab next-Play default is 1000 ms; accept integer 100..5000 ms. Server holds the active interval outside saved simulation state; repeated PLAY leaves it unchanged. | D051, D052, D055, D061 |
| Depth modules: which optional requirements remain applicable? | A/B are selected and implemented. C is omitted; live synchronization exists, but complete module D is not claimed. C's historical-boundary question is deferred rather than silently answered. | D001; README selected-module scope |

### Implementation and verification evidence

The checklist was checked against the shared engine's World, Robot, command,
movement, pathfinding, and snapshot code; the scenario parser/runner/reporter;
SQLite application transactions and recovery; server playback; and the Svelte
workbench/session/history implementation. The API and CLI import the same engine.

- [Engine world tests](packages/engine/test/world.test.ts): dimensions, IDs,
  atomic edits, feature overlap, resize, lifecycle, and immutable t0/queues.
- [Movement tests](packages/engine/test/movement.test.ts): numeric contention,
  no loser reconsideration, swaps, following/block propagation, rotations,
  iteration independence, blocked-command consumption, and origin/facing.
- [GOTO/battery tests](packages/engine/test/goto-battery.test.ts): path tie order,
  starting occupancy, completion/no-path progress, relocation, zero battery,
  charging order, and the explicit 98 battery sample regression.
- [Scenario tests](apps/scenario/test/runner.test.ts) and
  [real CLI process tests](apps/scenario/test/process.test.ts): grammar,
  whole-line rejection, defaults, FLOOR/EOF, exact output for all five original
  supplied scenario files, runner errors, and the mandatory root invocation.
- [Persistence tests](apps/api/test/persistence.test.mjs),
  [HTTP tests](apps/api/test/http.test.mjs), and
  [playback tests](apps/api/test/playback.test.mjs): full-state restoration,
  atomic rollback/history, rejection responses, restart recovery, one scheduler,
  lease expiry, and failure/recovery behavior.
- [Workbench tests](apps/web/test/workbench.test.ts) and
  [session tests](apps/web/test/session.test.ts): UI command mapping, committed
  state ownership, lifecycle restrictions, and synchronization/recovery.

Executed during the 2026-11-04 review: `npm test` rebuilt all workspaces and
passed 216 tests (116 engine/CLI, 72 API, 28 frontend); `npm run typecheck`
passed with zero Svelte errors/warnings; `git diff --check` passed. Browser tests
were not rerun in this review; prior browser evidence and its limits remain in
[Phase 6 results](docs/handoff/PHASE6_RESULTS.md).

No unresolved brief contradiction or ambiguity affecting the required core or
selected A/B scope was found in this review. This is a scoped review conclusion,
not a guarantee against every possible defect or undocumented future question.

## Specification ambiguities awaiting resolution

- If module C is selected: historical boundaries around edits between ticks.
  Deferred because timeline/fork is omitted; it does not block current A/B scope.
