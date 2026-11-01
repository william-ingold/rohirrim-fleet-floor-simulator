# Fleet Floor Simulator architecture

Implementation status, 2026-11-01: engine, CLI, SQLite/Nest API, scheduler,
SSE/presence and Svelte workbench are implemented. Phase 6 reviewed the complete
path and fixed two frontend defects; see [review results](docs/handoff/PHASE6_RESULTS.md)
and [README](README.md) for current behavior and checks. The planning status and
session-scope statements below are historical records of the original design.


Status: architecture planning. Confirmed decisions and proposals are marked separately.
No application implementation has started.

Current user scope: design implementation plans, handoff documents, and prompts
only; do not scaffold or implement this application in this chat. Start at
[HANDOFF.md](HANDOFF.md) for the phase plan, backend/frontend split, acceptance
matrix, contract draft, review items, and coding/design prompts.

## Confirmed direction and constraints

- The API uses NestJS (confirmed by the user).
- The brief requires a pure, testable engine shared by API and scenario runner,
  separate from framework and database code.
- Architectural decisions belong in this document. Product scope, time budget,
  and specification interpretations remain in DECISIONS.md.

## Confirmed architectural decisions

### A001 — World lifecycle and edit restrictions

Use an explicit world lifecycle: Setting Up, Paused, Playing, and Ended.
Setting Up is a distinct phase, completed by an explicit Finish Setup action
that establishes the initial baseline at t0 and enters Paused.
Setting Up allows dimension changes, robot placement, obstacle/charger edits,
and initial command queues. Finish Setup validates and captures the complete
initial world at tick zero, then enters Paused. Dimensions are fixed thereafter.
Paused allows robot placement, cell edits, command queue changes, and a manual
Step advancing one tick and remaining Paused. These later edits change the live
world without rewriting the t0 baseline. Playing permits automatically scheduled
ticks at an adjustable interval; editing requires Pause. Ended is read-only.

Reason: user preference for predictable, constrained world behavior. Enforce
these rules at the authoritative server/domain boundary, not only in the UI.

### A002 — Object-oriented domain model and world authority

Use Robot and Command classes with behavior. World is the final authority for
legal world changes and simulation tick advancement. Robot behavior must not
independently commit movement that bypasses collective resolution.

Reason: explicit user preference. Class APIs, mutation strategy, and exact
responsibilities are detailed below. The user subsequently selected a TypeScript
transition table with guards, without a state-machine library (A022).

### A003 — Manual stepping

Allow a single tick while Paused without starting continuous playback. Step and
automatic playback must use the same tick engine.

Reason: confirmed by the user and required by the brief. Playing is therefore
the continuous playback mode, not the only mode in which a tick can execute.

### A004 — Explicit setup boundary

Finish Setup establishes the run's initial snapshot and enters Paused without
advancing a simulation tick. Keep setup distinct from Paused because it defines
when the initial configuration becomes the baseline for the run.

Reason: the user explicitly chose a Finish Setup action and approved initial
configuration edits, fixed post-setup dimensions, and preserving the t0 baseline.
Detailed snapshot encoding and restoration of an existing run remain open.

### A005 — Completion and terminal state

Interactive worlds end through an explicit End action. Ended permits inspection
but prohibits further commands, ticks, and world mutations. Automatic queue
exhaustion is not an ending condition.

The CLI completes at end-of-file regardless of pending robot commands. Completion
does not add ticks, drain queues, discard pending commands, or print extra output.
The adapter mapping is confirmed in the CLI lifecycle section below.

Reason: confirmed by the user. Scenario directives, including REPORT, execute
exactly in their written order; no implicit robot-command draining is allowed.

The required scenario language advances time through TICK directives. Reaching
end-of-file does not imply draining queues or adding ticks. Any GOTO no-path
counter advances only on actual ticks; a pending GOTO remains queued until
arrival or abandonment. Charging can change state even when all queues are empty.
Do not add automatic ticks, alter REPORT timing, or silently discard pending
queues when implementing scenario completion.

### A006 — Re-placement preserves robot continuity

Re-placing an existing robot preserves its identity, battery, and command queue;
it is not a new robot or a reset. Update its position and facing only after World
validates the placement. Active GOTO recalculates from the new position on its next tick.
Successful re-placement resets the active GOTO's consecutive no-path count to
zero. Its target and queue position are preserved; its next tick recalculates a
path from the new position. Invalid placement does not reset progress.

The user explicitly confirmed that PLACE Rn X,Y,F updates both position and
facing for an existing robot. An invalid placement changes neither property.

Reason: user confirmed continuity of robot state and GOTO recalculation.

### A007 — Robot and Command tick protocol

Use a propose/resolve protocol. The front Command examines the Robot and the
same start-of-tick world snapshot used by all robots and produces an intent
without modifying either. World resolves intents collectively and supplies
outcomes for robot state and command-progress updates.

A blocked ordinary MOVE is consumed; unfinished GOTO remains at the front.
If a robot already occupies the GOTO target when that command reaches the front,
complete it on that tick without executing the next queued command. A robot
does not execute a second queued command in the same tick.

Reason: the user agreed to the protocol and already-at-target behavior. It
preserves simultaneous resolution and the one-command-per-robot-per-tick rule.
Method signatures, outcome taxonomy, and GOTO event labels remain undecided.

### A008 — Contention is resolved once per tick

When multiple robots attempt the same destination, the lowest numeric robot ID
wins the right to try; all other contenders are blocked for that tick. If the
winner is subsequently blocked, do not reconsider losing contenders.

Contention concerns a shared destination, not current occupancy: the winner need
not already occupy the destination. Separately, entry into an occupied cell
requires its occupant to successfully leave during the same tick. An intent to
leave is insufficient. Head-on swaps remain blocked and cycles of three or more
robots follow the brief's rotation rule.

Reason: user confirmed no reconsideration and the need for successful departure
before following into an occupied cell. Resolve contention once, then propagate
blocking through movement dependencies using the start-of-tick snapshot.

### A009 — GOTO no-path progress

Reset the active GOTO's consecutive no-path counter whenever pathfinding finds
a path, even if its subsequent movement attempt is blocked by contention or
another movement rule. Increment the counter only when pathfinding finds no
path. At three consecutive no-path ticks, drop GOTO and log UNREACHABLE as the
brief requires. Re-placement also resets the counter as specified in A006.

Reason: confirmed by the user. A pathfinding failure and a rejected movement
attempt are different conditions. See DECISIONS.md, D009.

### A010 — Tick battery ordering

Determine movement eligibility from each robot's start-of-tick battery. Resolve
movement collectively, deduct one battery for each successful move, then charge
every robot ending the tick on a charger by ten, capped at 100. Blocked movement
and turning cost nothing. Charging also applies to idle robots.

A robot starting at zero battery on a charger cannot move during that tick;
it charges at the end and may move on a later tick. Manual Step and automatic
playback use the same ordering.

Reason: confirmed by the user. End-of-tick charging cannot retroactively enable
movement in the same tick. See DECISIONS.md, D010.

### A011 — Immutable Robot and Command instances

Robot and Command instances are immutable. Operations return new instances
without changing their inputs; unchanged instances may be reused. Readers must
not receive mutable references to internal queues or nested state. Command
planning has no side effects, and progress updates produce replacement commands.

Reason: the user prefers predictable immutable transitions. This preserves
start-of-tick inputs and prior snapshots and avoids partially applied updates.
TypeScript readonly annotations alone do not enforce deep runtime immutability;
implementation must control references and defensively copy where necessary.

### A012 — Command interface without a base class

Concrete command classes share a Command interface. Do not introduce an abstract
base class at this stage; method signatures and exact plan/outcome types remain
proposed. Serialization uses tagged data rather than executable class instances.

Reason: the user confirmed that a common contract is useful while shared
implementation does not currently justify an additional inheritance layer.

### A013 — GOTO facing survives blocked movement

When GOTO finds a path, face the first step before attempting movement. Keep
that facing even if movement is subsequently blocked, including by contention.
The blocked move costs no battery; normal end-of-tick charging still applies
if the robot ends on a charger. No-path GOTO has no first step; its facing
behavior is not established by this decision.

Reason: the user confirmed that the free facing change is part of executing
GOTO and survives failure of its movement component. See DECISIONS.md, D011.

### A014 — Tick outcomes represent independent effects

Represent physical effects (resulting position, facing, battery), movement result
(succeeded, blocked with reason, or not attempted), and command progress
(completed, continuing, or abandoned) separately in the tick outcome contract.
An idle robot has no active command; represent that explicitly rather than
inventing command progress for it. Exact TypeScript types and event labels are
not finalized.

Reason: the user agreed that a single status label cannot express simultaneous
effects such as GOTO turning while blocked, charging while idle, or moving while
completing GOTO. Preserve all relevant effects in history and API results.

### A015 — Persist the current world as a minimal JSON snapshot

Use a serialized current-world snapshot in SQLite, storing the data necessary
to restore engine state rather than live class instances or derived indexes.
Include dimensions, logical tick, lifecycle, obstacles, chargers, robot identity,
position, facing, battery, queues, and command progress that affects future
execution. Reconstruct Robot and Command instances when loading.

Reason: the user accepted the snapshot approach while emphasizing minimal data.
Exact schema, metadata columns, JSON versioning, baseline storage, and history
format remain to be finalized. Append-only history and atomic state/history
transactions are confirmed in the persistence section below. Do not treat the current snapshot as
historical snapshots or as sufficient for module C.

At most 400 robots can occupy a valid world: dimensions are at most 20 x 20 and
robots cannot share cells. There is no stated queue-length cap; queues and
history can grow independently of robot count. The user explicitly chose to keep
robots and queues inside the same JSON snapshot, rather than separate robot rows.

Trade-offs: loading one record reconstructs complete simulation state, matching
whole-world tick execution and simplifying restoration. Each accepted change
rewrites the snapshot; SQLite cannot enforce most robot/queue invariants through
ordinary relational constraints, so the engine and snapshot validation must
enforce them. Splitting robot rows would enable targeted queries/updates but
requires more schema, ordered-queue reconstruction, and cross-record consistency
work. Revisit storage only if measured serialization or write costs justify it.
History remains separate and is not embedded in the current snapshot. See
DECISIONS.md, D012.

### A016 — Queue operations and atomic validation

Support append and Clear Queue in Setting Up and Paused. Clearing removes every
pending command, including active GOTO and its progress, without changing the
robot's position, facing, or battery. Do not add individual removal/reordering
initially. Appends preserve existing command progress and queue order.

Validate an entire enqueue batch before changing state. A malformed command or
invalid robot reference rejects the whole operation; accept no valid prefix.
Invalid scenario lines leave world state unchanged, produce no REPORT output,
and do not stop processing later lines. Parsing and validation must handle bad
input without uncaught exceptions. Unexpected internal/persistence failures are
not invalid user commands and must not be silently ignored.

Reason: user confirmed whole-line rejection and append/Clear Queue scope.
See DECISIONS.md, D013/D014. No new CLI CLEAR directive is selected; the required
scenario grammar remains unchanged unless explicitly extended later.

### A017 — GOTO scenario grammar and target validation

Parse GOTO X,Y as one queued command, including in mixed batches such as
QUEUE R1 MOVE GOTO 3,4 LEFT. Validate the complete line before appending; missing
or malformed GOTO arguments and out-of-bounds targets reject the whole line.
Accept in-bounds targets currently occupied by another robot or an obstacle;
pathfinding applies the existing no-path wait/abandonment rules.

Reason: user approved both choices and asked for a brief recheck. Re-read the
brief's scenario specification (pages 2–3) and module A (pages 4–5). It defines
QUEUE Rn CMD [CMD ...] and GOTO X,Y, but gives no explicit combined GOTO QUEUE
example. This grammar is an explicit interpretation, not a quoted requirement.
Case-insensitive commands, blank/comment-line handling, and all existing
scenario forms remain as specified. See DECISIONS.md, D015/D016.

## Command queue implementation draft

Confirmed constraints: one ordered queue per robot; immutable Robot/Command
instances; only the front command executes on a tick; GOTO remains at the front
until completed or abandoned. A command finishing does not execute its successor
on the same tick. Setup/Paused permit queue changes; Playing/Ended do not.

Proposed implementation: a private readonly array of Command instances owned by
Robot, with immutable append and head replacement/removal. Return a new Robot
for changes; expose readonly command snapshots rather than mutable collections.
Persist commands in order, including active GOTO progress. Commands behind the
head do not pathfind or accumulate progress while waiting.

A dedicated CommandQueue class is not currently recommended: add one only if
queue operations develop enough behavior to justify it. Arrays are simple, but
immutable append/removal copies queue references and queue size is unbounded by
the brief. No arbitrary domain queue limit is selected.

Append and Clear Queue, lifecycle restrictions, and atomic validation are
confirmed in A016. The readonly array implementation remains a proposal.

GOTO grammar and target validity are confirmed in A017. Parser implementation
details and the private readonly array implementation remain proposed.

### A018 — Restart Playing worlds as Paused

After a server restart, restore a world persisted as Playing into Paused and
require an explicit Play action to restart scheduling. Preserve its tick,
robots, queues, command progress, battery, t0 baseline, and existing history.
Worlds persisted as Setting Up, Paused, or Ended retain their lifecycle state.
Do not construct a new run or reset the logical tick when restoring one.

Apply the Playing-to-Paused recovery as a durable lifecycle change with a new
revision and append-only history entry, using the confirmed atomic persistence
boundary. Do not accept mutations or start scheduling until recovery commits;
surface recovery failure as a persistence error. Existing history is preserved,
not rewritten. This does not mean a browser refresh pauses a running server.

Reason: the user agreed that restarted playback requires explicit resumption.
The recovery mechanics follow D020–D022 so runtime and durable state agree.
See DECISIONS.md, D023.

### A019 — Pause takes effect between ticks

A tick is indivisible: Pause cannot interrupt its computation or persistence.
Serialize Pause with world actions. If a tick is already executing, let it
commit or fail before processing Pause. On successful Pause, persist and log the
lifecycle change before returning the stable world for editing.

Prevent later scheduled ticks from advancing the world after Pause. Timer
cancellation alone is insufficient: a callback that has already been scheduled
must recheck current authoritative lifecycle state when its action executes.
Such a stale scheduled callback is not a manual Step and must not consume a
command, advance tick/revision, or create tick history while Paused. Manual Step
remains explicitly allowed. On failed tick persistence, apply D022; Pause must
not expose its uncommitted result or claim success if its own save fails.

Reason: the user confirmed that pausing in the midst of a tick is not allowed.
See DECISIONS.md, D024. Exact scheduler APIs remain implementation details.

### A020 — End permissions and setup cancellation

Allow End from Paused or Playing. If a tick is already executing, process End
after that tick commits or fails. Persist the terminal lifecycle transition and
history atomically before returning success. Stop scheduling and reject stale
automatic callbacks after End; unlike Paused, Ended does not permit manual Step.

Retain the final snapshot and pending queues for inspection. Ended is terminal
for that world: no Play, edits, queue changes, re-placement, or further ticks.
Any future reset/fork/new-run operation must be separately defined and must not
silently reopen an Ended world.

Use a separate Cancel action during Setting Up rather than End, because no t0
baseline has been finalized. Cancel is selected. The user rejected retaining
cancelled drafts as unnecessary scope; do not add an archive, recovery UI, or a
Cancelled lifecycle state for that purpose. Discard the unfinished
setup and return to world creation, as approved by the user. Exact cleanup of already-persisted draft
records/history must be specified before implementation; this does not authorize
deleting finalized worlds or revising retained worlds' append-only history.

Reason: the user approved End from Paused/Playing with between-tick semantics,
preservation for inspection, and separate setup cancellation. See D025.

### A021 — Svelte frontend

Use Svelte + Vite with plain CSS/Svelte component styles. Do not introduce
SvelteKit or React for this application. Reason: user explicitly confirmed the
frontend proposal after reviewing the full architecture. See D047.

### A022 — Explicit lifecycle transition table

Implement the World lifecycle as a typed TypeScript transition table and guards,
without XState or state-pattern lifecycle classes. Keep simulation rules in
the pure engine and real-time scheduling/presence in the application service.
Reason: user confirmed the small explicit model fits scope and time. See D047.

### A023 — npm workspace structure

Use one repository and npm workspaces: apps/api (NestJS), apps/web (Svelte/Vite),
apps/scenario (CLI), and packages/engine (shared pure domain implementation).
Use one root installation/lockfile and preserve the required root scenario
invocation. Exact exports/build scripts are implementation details to verify
during scaffolding. Reason: user explicitly confirmed this layout. See D047.

## Proposed state and transition model

Represent each complete world state as serializable data. A deterministic engine
transition takes the current state and a domain action and returns the next state,
acceptance/rejection information, and domain events. No database, clock, timers,
network, or framework dependency belongs inside that transition.

Illustrative contract, not a finalized API:

    transition(worldState, action) -> transitionResult

Actions include placement, obstacle/charger edits, enqueueing commands, and
advancing one tick. Invalid actions produce an explicit rejection without a
partial state update. The CLI adapter can ignore these rejections as required;
the HTTP adapter can explain them to users.

A mathematical state-transition system does not require a state-machine library
or a small set of named world modes. Choose explicit modes only when their legal
transitions express a useful rule.

## Proposed ownership and objects

- World: aggregate boundary responsible for cross-robot invariants and applying
  one complete world transition. Prefer returning a new state over mutating the
  caller's state. A class with pure methods is compatible with this approach.
- Robot class: owns its local data (identity, position, facing, queue, battery,
  and any active GOTO progress). It may calculate an intent but cannot
  independently commit a movement into the world.
- Position: coordinate value with equality and neighbor operations.
- Cell: static floor features such as obstacle and charger, if a distinct value
  adds clarity. Derive robot occupancy from robot positions rather than persist
  a second independently mutable occupancy representation.
- Command classes: represent queued instructions and calculate intentions or
  command progress. Persist serializable command records with a type tag and
  arguments; recreate class instances when loading. Exact interface and class
  hierarchy remain proposed. Commands must not independently mutate the world.
- Scenario: input adapter that parses text into shared engine actions and handles
  REPORT formatting. Keep parsing and file I/O outside the domain engine.

## Robot and Command interface draft

Immutability and the shared Command interface are confirmed in A011/A012.
The method signatures, plan/outcome shapes, and detailed call flow below remain
proposals pending review.

### State ownership and purity

World holds the authoritative Robot instances. Robot fields and queue storage
are private; readers receive immutable snapshots or values, never references to
mutable internal collections. Commands cannot mutate a Robot or World.

Use immutable transitions: an operation that changes state returns a new Robot
and leaves the prior instance unchanged. Command progress follows the same rule.
This supports the pure-engine requirement and prevents partially applied ticks
from modifying the start-of-tick snapshot. Internal allocations can be optimized
later without changing the public contract.

### Illustrative Robot surface

    Robot.create(id, position, facing)
    Robot.fromSnapshot(snapshot)
    robot.toSnapshot() -> RobotSnapshot
    robot.enqueue(commands) -> Robot
    robot.reposition(position, facing) -> Robot
    robot.proposeTick(worldView) -> RobotIntent
    robot.applyTickResolution(resolution) -> Robot

Names and signatures are illustrative. World validates lifecycle permissions,
bounds, occupancy, and obstacle restrictions before placement; Robot handles
its local state change and active GOTO reset. Creation supplies battery 100 and
an empty queue; hydration restores saved battery/progress without resetting them.

World alone commits returned Robot instances into a new authoritative world.
TypeScript visibility is not a security boundary: the engine owns authoritative
references and exposes actions and snapshots to adapters. No need for friend-class
machinery or tokens merely to make Robot callable only from World.

### Illustrative Command surface

    interface Command {
      readonly kind: CommandKind
      propose(context: CommandContext): CommandPlan
      resolve(context: CommandContext, plan: CommandPlan,
              outcome: RobotTickOutcome): Command | null
      toSnapshot(): CommandSnapshot
    }

Use a shared interface for concrete command classes; MoveCommand, LeftCommand,
RightCommand, and GotoCommand are the proposed class breakdown. Do not add an
abstract base class now. A factory for restoring instances from tagged snapshots
is proposed.

CommandContext supplies immutable robot and read-only start-of-tick world data,
not a mutable World instance. CommandPlan is inert data describing movement,
turning, waiting, or already-at-target completion and any proposed progress.
Planning does not update the live counter or queue.

Resolve returns an updated command if it remains active, or null if consumed.
Only the front command may progress per tick. Robot applies the result to its
queue. The Command does not set position, facing, or battery. World resolution
specifies authorized physical effects and end-of-tick battery changes; Robot
applies those through the complete tick result. Exact outcome types remain open.

An idle robot still receives a resolution so charging and its idle outcome can
be recorded even though no Command is active. Outcomes must carry enough
information to represent GOTO waiting/completion and physical movement together.

### Open interface choices

- GOTO-specific records and method naming; avoid exposing a general-purpose
  robot patch operation or allowing commands to directly mutate world state.
- Review method signatures and plan/outcome types before implementing them.

## Proposed tick phases

1. Read every robot from the same start-of-tick state and derive intents.
2. Resolve movement permissions collectively: walls/obstacles, contention,
   head-on swaps, occupancy dependencies, and allowed longer cycles.
3. Produce the next state together: position/facing, queue progress, battery and
   charging, tick number, and an outcome for every robot.

These are computation phases of one transition, not durable lifecycle states.
Robot iteration order must not affect the result. Battery ordering and GOTO
no-path progress are defined in A009/A010. Precedence between competing blocked
reasons and remaining GOTO edge cases remain open. GOTO facing after a blocked
movement attempt is defined in A013.

## Confirmed tick resolution rules

### Battery eligibility versus contention

Confirmed: exclude zero-battery movement attempts before selecting
contested-cell winners. A robot unable to move does not reserve a destination.
Its current cell remains occupied and can block followers.

Example: R1 at (0,0) facing east with zero battery and R2 at (2,0) facing west
with positive battery both target (1,0). R1 is blocked NO_BATTERY and R2 moves.
Reason: user confirmed that an ineligible move need not enter contention. This
avoids an immobile robot reserving a destination it cannot enter. Its ordinary
MOVE is consumed and logged, not silently ignored or retried. See D017.

### Multiple blocked reasons

Confirmed: a movement attempt with zero starting battery reports
NO_BATTERY before checking bounds/obstacles. For eligible attempts, resolve
bounds/obstacles, contention, head-on swaps, and occupancy dependencies in the
brief's order. This supplies one deterministic primary reason.

Primary movement reasons: NO_BATTERY, OUT_OF_BOUNDS, OBSTACLE,
CONTESTED, HEAD_ON_SWAP, and OCCUPIED. OCCUPIED can include the direct blocker ID;
full causal-chain diagnostics are optional and not selected. No-path GOTO is a
command wait/progress result, not a failed physical movement attempt.

Reason: user approved battery-first precedence and one primary blocked reason.
See D018. Full causal-chain diagnostics remain optional and unselected.

### GOTO pathfinding versus battery eligibility

Confirmed: evaluate GOTO path availability even at zero battery.
Already-at-target completes; no path increments the no-path counter; a found
path resets that counter and specifies facing, then its movement is blocked
NO_BATTERY. Free turning and end-of-tick charging still occur as agreed.

Reason: user confirmed that zero battery restricts movement rather than all
command processing, including already-at-target completion. See D019.

Confirmed resolution ordering:
derive front-command plans from the same snapshot; apply movement battery
eligibility and walls/obstacles; select contenders once; block head-on swaps;
resolve occupancy dependencies and permitted longer cycles; build new robots
with authorized position/facing, command progress, movement cost, and final
charging; advance the logical tick and produce all outcomes. No partial state
is exposed. Exact TypeScript records remain open; the atomic persistence boundary
is confirmed below.

## Candidate robot and application modes

Idle, moved, turned, and blocked describe tick outcomes and need not become
persistent robot states. No battery can normally be derived from battery = 0.
GOTO needs persistent progress (at least consecutive no-path count); an explicit
active-command lifecycle may be useful if it makes its rules clearer.

World lifecycle guards edit and execution permissions. A Nest application service
can own the real-time scheduler, which requests ticks from World; World owns
logical tick advancement. This separation is proposed so the engine contains no
wall-clock timers and the CLI can advance ticks without waiting. Edit mode and
selection remain UI concerns. Restart behavior is defined in A018 and queued
timer handling at Pause in A019.

## State-machine alternatives considered (transition table selected)

- Explicit TypeScript transition table and guards: small implementation, no new
  dependency, easy to keep serializable. We must define and test transitions and
  rejections ourselves. Selected for this bounded lifecycle and time target.
- XState: declarative transitions and guards, hierarchical/parallel states, and
  actor persistence support. Provides room for complex lifecycle behavior, but
  adds concepts and integration/serialization work. It does not replace the
  movement resolver or SQLite transactions. Not selected; no XState version
  is needed for this implementation.
- State-pattern classes: one class per lifecycle state implementing allowed
  behavior. Aligns with OO preferences but adds classes and can scatter the
  transition graph. Not recommended for four small lifecycle modes.

Avoid independent robot actors initially: one authoritative simultaneous resolver
is still necessary, and asynchronous per-robot execution complicates coordination.
This is a recommendation, not a rejection of robot-local transition logic.

## Confirmed persistence transactions and history

The user approved the transaction boundary, append-only audit history, and
surfaced-error/rollback behavior. See DECISIONS.md, D020–D022. Detailed SQL
schema details and API error payloads remain open; the driver is better-sqlite3.

### Atomic world updates

Treat SQLite as authoritative. For one accepted domain action: begin a short
write transaction, load the latest snapshot/revision, validate and compute the
transition with the pure engine, write the new snapshot and next revision,
append a history record, and commit. Only then return success or publish updated
state. Finish Setup captures t0 in that same transaction. A rejected action
changes neither snapshot, revision, nor world-change history.

Use BEGIN IMMEDIATE for the read/compute/write sequence to acquire the
writer slot before reading the world version. Keep the transaction local and
short; do not include network calls, timer waits, or unrelated asynchronous work.
Serialize in-process actions per world and avoid overlapping scheduled ticks.
These safeguards do not constitute selecting module D or real-time sync.

### History contents

Use one append-only history record per committed state-changing domain action, with
world identity, revision, current tick, action type and payload, and effects.
Tick effects contain one outcome per robot, including idle, movement, facing,
battery, and command progress as applicable. Record setup/paused edits, queue
clears, and lifecycle transitions in addition to required placements, obstacles,
enqueue operations, and tick results. Keep prior state out of each record unless
needed to make an effect understandable; do not duplicate the full world.

Revision advances for each accepted state-changing action, including ticks that
advance logical time with only idle robots. Invalid actions and true no-ops do
not advance revision or append world-change history. Tick advances only on an
actual tick. Store a timestamp as metadata; engine behavior must not depend on it.

History is an audit log, not the authoritative event-sourced
state. The current snapshot supports restoration. Complete historical replay and
module C remain uncommitted; action logging alone is not a replay guarantee.

### Failure behavior

On validation rejection, continue processing later CLI lines or return a clear
API rejection without changes. On computation/storage failure, roll back when
possible, report failure, and do not expose the calculated world as committed.
Pause automatic scheduling on a failed tick and retain the last committed world;
never consume a queued command only in memory. An unavailable database cannot
durably record Paused, so this stop is scheduler behavior, not a fabricated
persisted lifecycle transition. Recovery/reload reads SQLite before resuming.

If commit outcome is uncertain, reread durable state before retrying rather than
blindly executing the action again. Exact error responses, retry/backoff policy,
and request-id idempotency are not selected. CLI database integration is not
required by these persistence decisions: its shared engine can remain in memory.

## Confirmed CLI lifecycle mapping

The user approved the mapping below. See DECISIONS.md, D026/D027.

- Start each scenario as an isolated in-memory world in Setting Up, default 5 x 5.
  Import the same engine used by the API; do not require an HTTP server or write
  the interactive world's SQLite database. Runner state need not survive exit.
- Apply valid placement, obstacle/charger, and enqueue directives in Setting Up.
- REPORT and REPORT BATTERY inspect current state in either Setting Up or Paused;
  they do not finish setup, advance time, or alter state/history.
- The first valid TICK directive implicitly invokes Finish Setup, capturing t0
  and entering Paused. Execute its requested ticks through manual Step, remaining
  Paused. Later edits and TICK directives alternate in Paused without Play or
  wall-clock timers. Invalid directives do not trigger lifecycle transitions.
- At end-of-file, if still Setting Up, implicitly Finish Setup; then End the
  in-memory world. Do not add ticks, drain/discard queues, or print a final report.
  This is runner lifecycle completion, not a new END syntax requirement.
- Confirmed FLOOR interpretation: valid FLOOR during Setting Up replaces the
  draft with an empty floor of the specified dimensions (no robots, obstacles,
  chargers, or queued commands). Invalid FLOOR leaves it unchanged. Once setup
  finishes, ignore later FLOOR lines to preserve the fixed-dimension rule.
  This reset/restriction is an explicit interpretation of undefined behavior,
  not a claim that the brief specifies it. CLI draft replacement affects only
  the isolated run; it is not permission to delete persisted worlds/history.

Exact integer grammar for TICK and handling of filesystem failures remain open.
Parser errors follow D013; filesystem/internal errors must be surfaced rather
than disguised as invalid scenario lines.

## HTTP API contract: confirmed direction and open details

Confirmed: use one action endpoint for mutations, because the user prefers a
manageable contract aligned with World actions. The read/create/history route
details, payloads, and error mapping below remain proposed. User explicitly
selected latest-state handling for all actions: do not require expectedRevision
or reject edits merely because the client's revision is older. The user
challenged polling and then selected HTTP actions plus SSE updates after
comparing WebSockets, prioritizing controllability within the time budget.

### Endpoint shape

Recommend a small action-oriented API aligned with the engine action model:

    POST /api/worlds                     create a Setting Up world
    GET  /api/worlds/:id                 current state and revision
    POST /api/worlds/:id/actions         submit one domain action
    GET  /api/worlds/:id/history         paginated revision-ordered history

Candidate action tags: FINISH_SETUP, PLAY, PAUSE, STEP, END, PLACE_ROBOT,
SET_OBSTACLE, SET_CHARGER, ENQUEUE_COMMANDS, CLEAR_QUEUE, and setup-only resizing.
Exact names/payloads and draft resizing behavior remain open. Setup Cancel is
excluded until its retention behavior is decided; do not infer a DELETE endpoint.
World discovery/listing is still an explicit UI/API question, not a committed
multi-floor-management feature. Restore identity across refresh via the URL.

Prefer SET_OBSTACLE/SET_CHARGER with an explicit desired boolean rather than
transport-level toggles; repeating a desired state cannot accidentally reverse
the previous edit. Domain representation and history remain engine concerns.

Alternative: separate resource endpoints for robots, queues, cells, and playback.
These are more conventional resource operations but require more routes/DTOs.
Either shape must call the same application service and shared engine; neither
allows controllers or clients to independently apply simulation rules.

### Success and errors

Return world identity, revision, complete committed snapshot, and history entries
created by that action, not the entire historical log. Use plain JSON DTOs, never
live Robot/Command instances. A no-op response can contain unchanged revision
and empty new-history entries. Tick blocked outcomes are normal successful
simulation results, not failed HTTP requests.

Proposed errors: malformed request 400; unknown world 404;
lifecycle conflict 409; otherwise well-formed illegal domain action 422;
temporary persistence unavailability 503; unexpected internal failure 500.
Use a stable error code and human-readable message. Do not leak stack traces or
claim a new authoritative state when saving failed. API explains domain
rejections even though the CLI ignores invalid lines.

### Stale UI and playback updates

Confirmed: validate and execute every action against the latest committed world
inside the serialized write transaction. Do not require expectedRevision for
edits, Step, setup completion, Play, Pause, or End. A stale client is not itself
a rejection reason. All current-state lifecycle/placement/queue constraints still
apply; reject actions that are now illegal without partial changes. Submit typed
actions rather than accepting a client-supplied replacement world snapshot.
Revisions remain useful for history ordering, response deduplication, and stream
recovery. This policy does not provide request-id idempotency. See D029.

Recommend one in-flight UI mutation at a time initially; browser state is a
rendered copy of server state. GET requests never advance ticks. Ignore stale
out-of-order responses using revision; action failure must clear the UI's
pending-operation state without fabricating successful edits.

### Confirmed HTTP + SSE transport

Use SSE for updates at GET /api/worlds/:id/events, with HTTP POST actions
remaining the client-to-server path. SSE matches one-way committed-world updates;
WebSockets support bidirectional messages but would introduce another command
transport without an established requirement. Polling was initially proposed to
reduce implementation work, at the cost of delayed updates and repeated reads.
User explicitly challenged that trade-off and prioritizes server-push.

The user asked whether a live two-way UI implies WebSockets. Both designs
support a two-way product: HTTP actions plus SSE updates, or WebSocket action
and update messages over one persistent connection. WebSockets are appropriate
for frequent bidirectional streaming; they are also viable here. SSE is
recommended because inputs are discrete actions and outputs are server-driven
ticks. Neither transport replaces commit acknowledgements, validation, ordered
application actions, reconnection recovery, or server-owned tick scheduling.
Nest supports SSE endpoints and WebSocket gateways. The user selected HTTP + SSE;
WebSockets and periodic polling are not the chosen primary update transport.
Reason: manageable request/response actions plus server-push without expanding
the time scope unnecessarily. See DECISIONS.md, D030.

Emit revision-tagged state/history notifications only after database commit.
Confirmed: send a complete current-state snapshot on subscription and a
revision-tagged snapshot after committed changes, rather than requiring the
client to reconstruct missed deltas. Reconnect restores current state and fetches
missing history. Exact payload and history attachment remain open. HTTP action
responses and SSE can carry the same revision, so clients must deduplicate them.

EventSource reconnects automatically, but replay/catch-up is application work.
Initial subscription and reconnection need a race-free subscribe/snapshot or
replay sequence; a separate GET followed by naive subscription can miss updates.
Refresh current state and fetch missing history by revision on reconnect/gaps.
Streaming failure after commit does not roll back a committed world action.
Post-commit delivery must preserve revision ordering or cause an explicit resync.
The wire contract and reconnect/presence behavior are confirmed below. Exact
slow-client thresholds and page-size defaults remain implementation details.
This does not alone commit the project to completing module D.

References checked: https://html.spec.whatwg.org/multipage/server-sent-events.html
and https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events.

### Confirmed disconnection and heartbeat policy

User reaffirmed server authority and challenged playback continuing after every
client disconnects, asking about detection and heartbeats. The user approved
5-second browser heartbeats, 15-second lease expiry, last-client automatic Pause,
and explicit Play after reconnection. See DECISIONS.md, D036.

Use transient per-world client leases tied to SSE subscriptions. Browsers
renew presence through a small HTTP heartbeat while subscribed every
5 seconds; expire a lease after no renewal for 15 seconds. Renewals are
transport metadata, not world actions: no simulation tick, revision, snapshot
write, or domain history entry per heartbeat. Use server time for lease expiry,
outside the pure engine. Route and stream/lease ID protocol remain proposed.

Observe SSE response close/stream cleanup as an early disconnect signal, but
do not assume abrupt network loss is immediately detected. A one-way SSE
heartbeat cannot prove the browser received or processed it; use a browser-to-
server acknowledgement/lease renewal for application-level liveness.

Pause when the last lease expires, not when any single tab disappears. Let the
last lease deadline provide a reconnect/refresh grace period. Recheck presence
when executing a scheduled tick so an overdue timer cannot continue unattended
playback. In-flight ticks remain indivisible. Apply normal persisted Pause with
an explicit no-clients reason in history; save failure follows D022.

Reconnect before expiry leaves playback unchanged; reconnect after auto-pause
restores Paused and requires explicit Play. Require a live subscription/lease
for interactive Play; CLI Steps remain independent. Reject late renewals for
superseded streams so they cannot revive abandoned leases. Detailed lease
registration, renewal route, and stream identifiers remain to be designed;
no multi-user module is selected.

Test last-client expiry, one remaining client, refresh/reconnect before timeout,
no automatic resume after pause, and no mutation/tick from heartbeat traffic.

## Confirmed API/SSE wire contract

User approved the response/event contract, race-free subscription, snapshot-based
reconnect, heartbeat subscription IDs, and no blind mutation retry. See
DECISIONS.md, D046.

Use read/create/actions/history routes and GET /api/worlds/:id/events
plus POST /api/worlds/:id/presence for lease renewal. Presence is transport
metadata, not a domain mutation endpoint or a reason to increment revision.

Successful mutation envelope: worldId, revision, state (full current snapshot),
and historyEntries (only records created by that action). Errors use
error.code and error.message, with the HTTP status mapping already proposed.
No client replacement snapshot or expectedRevision requirement. No-op responses
contain unchanged revision and empty historyEntries.

New SSE subscriptions emit stream.ready with a transient subscriptionId, then
world.snapshot with worldId/revision/state. Future world.updated events contain
the same full snapshot and historyEntries for that committed action. Use revision
as the SSE world-event ID; ready/presence metadata does not have a world revision
event ID. Handle stream.ready even if world snapshot revision is a duplicate.

Register and buffer the subscriber before reading the current snapshot; send
that snapshot, then only buffered/live updates with revision greater than it.
Keep publication ordered within each world's application-action serialization.
Do not hold a database transaction open while streaming to a client. Slow-client
buffers must be bounded; close/resync rather than accumulating unbounded memory.

On reconnect, create a new subscription/lease and send the latest snapshot,
regardless of Last-Event-ID. Fetch missing audit history through GET history
afterRevision=<lastSeen>&throughRevision=<snapshotRevision>, using revision
pagination. Do not promise historical snapshot replay or replay missed ticks in
the browser. Full snapshots replace current rendering; history deduplicates by
(worldId, revision). Resume the stream after baseline without regressing state.

Presence renewals carry subscriptionId and return latest world revision; they
only renew a current subscription's live lease. A client discovering a revision
gap/stalled state via heartbeat can resynchronize, including a last update lost
without a later event to expose the gap. A reconnect cannot reuse or revive an
old subscription ID. No automatic retry of ambiguous mutation requests; error
responses distinguish committed state updates from transport delivery failure.

Per-world snapshot schema versioning, JSON decoding validation, and configurable
history page limits are required implementation details. Exact limit values,
lease registration validation, and slow-client buffer thresholds need to be
documented with the final contract, not inferred as new domain queue limits.

## Runtime and SQLite tooling

Confirmed environment: development uses WSL/Linux. The user authorizes planning
for a recent/latest Node.js release and Unix-based evaluator. Evaluator support
is an assumption, not independently confirmed. No native Windows requirement.

Version check on 2026-10-31: official Node download page lists 26.13.0 LTS and
27.0.0-alpha.0.0.0 Alpha. Confirmed: pin Node 26.13.0, rather than a floating
latest or alpha release. The user approved the runtime and tooling below.

Confirmed tooling: better-sqlite3 with prepared SQL statements, versioned SQL
migration files, and an applied-migrations table. No ORM initially. Run migrations
transactionally and fail startup if they fail. The broad schema comprises worlds
(current snapshot, revision, schema version, and t0), world_history (append-only
action/effect records), and schema_migrations. Detailed columns and constraints
remain open. See DECISIONS.md, D032.

Alternatives considered:

- better-sqlite3 plus direct prepared SQL (selected): fits this small schema;
  synchronous transactions are straightforward and an established external
  package avoids adopting the built-in API's current release-candidate status.
  Adds a native addon; prebuilt binaries are available for major platforms, but
  selected Node/platform installation must be verified during scaffolding.
- Built-in node:sqlite plus direct SQL: no external SQLite addon installation,
  supports prepared statements, but current Node 26 docs mark Stability 1.2
  (release candidate). API naming differs across Node versions; use the pinned
  version's documentation rather than copying DatabaseSync examples blindly.
- Drizzle over a SQLite driver: typed schema/query building and migration
  tooling, at the cost of another dependency/tooling layer. Can be worthwhile
  if relational queries grow; limited payoff for current-world JSON plus history.

Do not generate application tables or driver code during architecture planning.
Exact table definitions, migration runner details, connection options, and
dependency version pin await design/setup. Driver and Node runtime are confirmed.

Sources: https://nodejs.org/en/download ; https://nodejs.org/api/sqlite.html ;
https://github.com/WiseLibs/better-sqlite3 ;
https://orm.drizzle.team/docs/sqlite/get-started-sqlite .

### Confirmed schema constraints

- worlds has one row per world and a required current snapshot. Its t0 snapshot
  is null until Finish Setup, then immutable for that run.
- world_history references worlds and has a unique (world_id, revision) pair,
  matching the one-history-record-per-committed-action policy.
- schema_migrations records each applied migration once.
- Loading validates snapshot structure and domain invariants before exposing
  a world. Invalid persisted state surfaces an error; never silently reset or
  replace it with defaults. Reconstruct classes only from validated data.

Reason: user approved these constraints as safeguards for the existing snapshot,
baseline, and atomic history decisions. Exact SQL definitions and validation
implementation remain open. See DECISIONS.md, D033.

## Confirmed testing strategy

- Engine: Vitest for simultaneous movement, dependencies, contention, GOTO,
  battery, and immutable transitions, extending well beyond brief examples.
- CLI: Vitest for exact REPORT output, parser behavior, invalid-line recovery,
  scenario fixtures, and implicit lifecycle mapping.
- API/persistence: Jest and Supertest for request validation, transactions,
  rollback, restart recovery, and SSE connection/recovery at the HTTP boundary.
- Svelte UI: Vitest and Testing Library for user actions, lifecycle restrictions,
  committed-state rendering, and SSE-driven updates.

Priority regressions: input robot iteration order must not alter tick results;
failed persistence must preserve queues and state; UI reconnect must restore
authoritative state without applying old responses or losing history.

Reason: user approved this tool split and coverage. Prefer behavioral assertions
over tests mirroring implementation. Verify Nest decorator/transform setup and
shared-package imports during scaffolding. Exact versions, configuration, root
test orchestration, and detailed fixtures remain open. See D034.

## Discussion record: questions, objections, and rationale

Retrospective paraphrases of this chat, not verbatim quotations. Record future
questions and pushbacks here alongside their resolution; keep unresolved points
explicit rather than turning recommendations into approvals.

Historical open/review statuses below describe the point in the discussion.
Current status: R1–R5 are resolved in D050–D060, D061/D062 amend the boundary,
D063 approves the visual specification, and CONTRACT.md is approved and frozen
for the documented boundary. Planning-only scope remains in force.

- Planning versus coding: user clarified that this chat will design implementation
  and handoff documents/prompts, not implement. Separate backend/frontend work,
  use fitting TDD/DDD/spec/BDD practices, and prepare an AI UI/UX design prompt.
  That instruction supersedes any suggestion to start scaffolding here.
- Visual direction: user selected a bright, approachable educational simulation
  workbench. Handoffs primarily target coding agents; an AI design tool will
  propose colors, animations, and effects. Exact palette/motion values are not
  approved by choosing that direction (D049).
- Handoff audit: translating decisions into independent frontend/backend briefs
  exposed cancellation-response, speed, deployment-process, and snapshot-version
  details. Keep these explicit in docs/handoff/REVIEW_ITEMS.md. Exact DTO/SQL
  names in CONTRACT.md remain a review draft, not new user-approved behavior.
- R1 cancellation response (2026-11-01): compared a 200 receipt identifying the
  discarded world with 204 No Content. User chose 200; record
  `{worldId, cancelled: true}` after commit as D050. Existing atomic disposal,
  commit-before-navigation, and no-retention decisions remain in force. No
  additional pushback was expressed in this exchange.
- R2 playback speed (2026-11-01): user agreed to per-tab selection with a 1000ms
  default, selection during Setting Up/Paused, `tickIntervalMs` passed on PLAY,
  and scheduler ownership outside durable state. Explained that tabs may select
  different speeds and refresh resets selection to 1000ms. Record as D051.
  User subsequently approved whole-number milliseconds from 100 through 5000
  inclusive, enforced in UI and API (D052), after comparison with broader limits
  and their harder-to-follow playback or longer waits. R2 is resolved. No
  additional pushback was expressed.

- R3 deployment boundary (2026-11-01): user stated, "We don't need scaling or
  availability," and chose one API process. Record as D053, with one owner for
  serialization, scheduling, SSE, and presence. This narrows deployment scope;
  confirmed durability, failure handling, and restart recovery remain required.

- R4 snapshot versions (2026-11-01): user agreed to rejecting unsupported saved
  versions without altering data and clarified, "we don't plan on changing the
  world format." Record as D054. Avoid speculative automatic JSON migration
  work; existing SQL migration and validation requirements remain in force.

- R5 repeated lifecycle actions: user agreed that PLAY while Playing, PAUSE
  while Paused, and END while Ended return unchanged state with HTTP 200 and
  no new revision/history (D055). Repeated PLAY keeps the running interval.
  Compared tolerance of duplicate clicks/another tab's action with 409 errors
  for redundant requests. STEP/ENQUEUE retry rules remain unchanged. No
  additional pushback was expressed; remaining R5 proposals are open.

- R5 creation revision/history: user agreed to revision 1, tick 0, and an
  atomic CREATE history entry, with t0 null until Finish Setup (D056). Compared
  a complete audit beginning at creation with revision 0 without a creation
  entry. A cursor after revision 0 retrieves history from creation. No
  additional pushback was expressed; remaining R5 proposals are open.

- R5 cancelled-draft streams: user agreed to closing streams and invalidating
  subscriptions after deletion commits, with other tabs confirming deletion by
  GET/404 before returning to creation (D057). Network/server errors do not
  imply deletion. Compared this use of existing routes with a dedicated
  cancellation event requiring a missed-delivery fallback. No additional
  pushback was expressed; remaining R5 proposals are open.

- R5 automatic tick failure notification: user approved SSE operational status
  indicating scheduling stopped, with a readable error and current status sent
  on reconnect (D058). UI preserves the committed lifecycle/revision/history
  and shows "Playback stopped due to an error." Compared direct notification
  with HTTP errors alone, which would not directly surface automatic failures.
  No additional pushback was expressed; exact contract vocabulary remains open.

- R5 operational event/error names: user approved `scheduler.error` with
  `{worldId, error: {code, message}}` and no event ID, plus
  `PERSISTENCE_UNAVAILABLE`, `INTERNAL_ERROR`, and HTTP 500 with
  `UNSUPPORTED_SNAPSHOT_VERSION` for unsupported saved formats (D059). Compared
  the dedicated format-error code with a generic internal error and explained
  reuse of the existing error shape. No additional pushback was expressed;
  remaining DTO/SQL vocabulary is open.

- R5 final boundary approval: user approved the remaining snapshot/envelope,
  action/route, history/presence, status/error, and SQL table vocabulary (D060).
  Reviewed the benefit of a shared backend/frontend contract and the existing
  JSON storage trade-offs. R1–R5 are resolved and the documented contract is
  frozen. SQL syntax/pragmas, versions, and bounded transport defaults remain
  implementation details within confirmed behavior. No additional pushback
  was expressed; planning-only scope remains in force.

- Design review: the design pass found no named recovery after `scheduler.error`,
  because PLAY is a no-op while the lifecycle stays Playing. User agreed Pause
  is the recovery path (D062). The assistant recommended leaving the running
  interval hidden; user instead chose to show it and agreed to a transport field
  (D061). User raised mouse dragging as an alternative to arrow keys and left the
  choice open; arrow keys were kept because dragging implies path drawing.
  User approved the visual specification and asked for ample or scrollable
  history space (D063).

- Testing roles: user asked whether Next.js/Jest were backend tools and
  Svelte/Vitest frontend tools. Distinguished frameworks from runners and Next.js
  from NestJS; user confirmed NestJS. Asked why avoid Jest; clarified there was
  no need to avoid it and revised the recommendation to consider Jest for API
  and Vitest elsewhere. That split was subsequently confirmed in D034.
- State-machine/OO direction: user proposed tiered machines and World, Robot,
  Cell, Command, Scenario objects. Adopted meaningful world lifecycle guards,
  Robot/Command classes, and World as collective authority. Explained why tick
  outcomes need not become durable robot modes. Library choice remains open.
- Setup distinction: user asked to be convinced Setting Up differs from Paused.
  Compared construction-only setup with an explicit baseline boundary. User
  chose Finish Setup and t0 capture, approving edits before it and fixed
  dimensions afterward (A001/A004; D005).
- Completion: user initially associated End with exhausted scenario commands,
  possibly followed by more GOTO ticks. Distinguished file directives from robot
  queues and showed that draining adds unrequested ticks. User approved EOF for
  CLI and explicit End for interactive worlds (A005; D006).
- Re-placement: user emphasized preserving robot state except relocation, then
  clarified facing also changes. Preserved battery/queue/identity, recalculated
  GOTO, and explicitly agreed to reset no-path progress (A006; D007).
- Contention: user agreed to no reconsideration and discussed occupied cells.
  Clarified shared-destination contention versus following an occupant that
  successfully leaves (A008; D008).
- Robot completeness: user asked what remained for Robot/World. Identified
  GOTO counter semantics, battery ordering, encapsulation, and outcomes; user
  approved found-path resets and charge-after-movement (A009/A010; D009/D010).
- Document separation: user required architecture outside DECISIONS.md, then
  reminded that behavior assumptions also belong there. Keep architecture
  rationale here and externally observable interpretations in DECISIONS.md.
- Interface design: user preferred immutable instances for predictability and
  rejected an abstract Command base as unnecessary abstraction. Confirmed
  immutability and a shared interface; signatures remain proposed (A011/A012).
- GOTO effects: user agreed free turning persists after blocked movement and
  battery is not consumed. Separated physical effects, movement results, and
  command progress to preserve simultaneous effects (A013/A014; D011).
- Snapshot contents: user asked whether the whole world was a blob and whether
  robots should have separate storage due to possible size/noise. Explained
  structured JSON, the implicit 400-robot maximum, and unbounded queue/history
  growth. User chose one minimal snapshot with explicit trade-offs (A015; D012).
- Invalid queues and editing: user emphasized malformed lines must not crash
  or partially alter state. Approved atomic line rejection and Clear Queue for
  flexibility without individual reordering/removal (A016; D013/D014).
- GOTO syntax: user requested rereading the brief before accepting combined
  QUEUE syntax. Rechecked pages 2–5: combined form is inferred, not explicitly
  demonstrated. Recorded that distinction and accepted unreachable in-bounds
  targets (A017; D015/D016).
- Battery resolution: user preferred avoiding unnecessary contention for
  zero-battery moves, battery-first reasons, and GOTO completion at zero battery.
  Recorded these as explicit module-interaction interpretations (D017–D019).
- Persistence: user approved atomic snapshot/history transactions and emphasized
  surfaced errors with no partial changes. User believed append-only was stated
  in the brief; clarified it is our storage design meeting the required history
  log (D020–D022).
- Lifecycle recovery: user agreed restart should pause playback and stated a
  tick cannot be interrupted. Confirmed between-tick Pause/End and terminal
  inspection; setup Cancel was later simplified to discard the draft
  (A018–A020; D023–D025, D037).
- CLI compatibility: user approved implicit lifecycle actions, in-memory
  isolation, and setup-only FLOOR replacement without extra syntax (D026/D027).
- API transport: user approved one mutation endpoint for manageability and
  clarified that every action should use latest committed state, without stale
  revision rejection (D029). User challenged polling as insufficiently focused
  on server-push, then asked whether two-way UI favors WebSockets. Explained
  HTTP+SSE versus bidirectional WebSockets; both are viable. User then selected
  HTTP+SSE for controllability within the time scope (D030). Stream payload,
  handshake/recovery details, and related tests remain to be finalized.
- Runtime: user specified WSL/Linux and authorized assuming latest Node/Unix
  for evaluation. Distinguished that assumption from verified evaluator support.
  Compared built-in SQLite, better-sqlite3, and Drizzle. User preferred a
  stable/mature library and approved better-sqlite3, Node 26.13.0, and plain SQL
  migrations rather than an ORM (D032).
- Schema safeguards: user approved a required current snapshot, null-until-
  finalized then immutable t0, unique world/revision history, one-time migration
  records, and surfacing invalid saved state rather than silently resetting it
  (D033).
- Testing selection: after earlier questioning whether Jest was unnecessary,
  user approved Jest/Supertest for API/persistence and Vitest for engine, CLI,
  and Svelte UI with Testing Library, including SSE recovery coverage (D034).
- Unattended playback: user accepted snapshot synchronization but objected to
  continuing playback without clients and asked about heartbeats. Proposed
  server-managed presence leases and between-tick auto-pause after all leases
  expire. User approved 5-second heartbeats, 15-second expiry, and explicit
  playback resumption after reconnecting (D036).
- Wire contract: user approved committed snapshot/history responses, structured
  errors, stream.ready/world.snapshot/world.updated events, race-free buffered
  subscription, current-state reconnect with separate history catch-up, lease
  IDs, and no blind automatic mutation retry (D046).
- Cancel scope: assistant suggested retaining cancelled drafts for inspection;
  user challenged this as out of scope. Withdraw that recommendation: there is
  no requirement for draft archives or recovery. Recommend simple disposal of
  unfinished setup; user agreed. Persisted-draft cleanup remains an
  implementation/design detail to resolve without adding a retained
  cancellation state (D037).

## Confirmed behavior refinements

User requested resolving these before implementation and approved all eight
rules below. See DECISIONS.md, D038–D045.

1. Numeric grammar: decimal digits only for scenario integers (no fractional,
   exponent, or signed notation). Dimensions 1..20, in-bounds nonnegative
   coordinates, positive safe-integer TICK counts; omitted count means 1.
   TICK 0 and negative counts are invalid and do not implicitly finish setup.
2. Robot IDs: positive decimal numeric IDs with case-insensitive R prefix;
   normalize leading zeros (r01 becomes R1) so aliases cannot create duplicate
   numeric identities. Reject R0 and unsafe integers. Assign the smallest unused
   positive ID for UI placement; numeric ordering governs output/contention.
3. Text grammar: trim lines, permit spaces/tabs between tokens and around
   commas, preserve case-insensitive keywords/facings. Lines whose first
   non-whitespace character is # are comments. No inline comments or trailing
   unrecognized tokens; reject the whole affected line.
4. GOTO with no path preserves facing; at-target and no-path waits consume no
   movement battery, though charging applies. Pending commands behind the head
   neither execute nor accumulate GOTO progress.
5. Chargers and obstacles may coexist because the brief allows a charger on
   any cell; an obstacle still prevents robot entry. Charger edits do not charge
   immediately; charging occurs only at tick end. Removing an obstacle does not
   remove a charger or vice versa.
6. UI setup resizing preserves contents and rejects the entire resize if any
   robot, obstacle, charger, or queued GOTO target would become out of bounds.
   It does not clip/delete contents. This differs explicitly from approved CLI
   FLOOR draft replacement. Dimensions remain fixed after Finish Setup.
7. Cancel deletes the entire unfinished persisted draft and its associated
   setup history in one transaction, returning to creation only on success.
   Append-only history applies to retained worlds; no individual history
   rewriting/deletion for them. This whole-draft disposal exception must be
   explicit. Finalized worlds cannot be cancelled.
8. Missing/unreadable scenario file or invalid invocation is a runner error:
   readable stderr, nonzero exit. Invalid scenario lines are ignored; they do
   not make an otherwise successfully processed scenario exit with an error.
   An unreadable file is not treated as an empty successful scenario.

## Pre-implementation audit

The domain, lifecycle, current-state storage, transaction/failure behavior,
transport, presence policy, and test-tool split have enough agreed direction
to implement. Do not restart design of those areas without new evidence.

The user explicitly confirmed the final three stack/structure choices:

1. Svelte + Vite with plain/component CSS for the frontend (no SvelteKit).
2. TypeScript lifecycle transition table with guards, no state-machine library.
3. npm workspaces with apps/api, apps/web, apps/scenario, and packages/engine.

User wants outstanding behavior resolved before implementation; the behavior
checklist and API/SSE payload/recovery contract are confirmed. Exact method
names, internal SQL layout, and build setup must respect those decisions; do not
mistake the implementation-order recommendation for permission to defer behavior.

Implementation order recommendation: engine/rule tests, scenario parser and
fixtures, SQLite/API integration, then UI/SSE/presence. Core and modules A/B
remain committed; module C remains stretch. No application code is scaffolded.

## Determinism and history

Replay requires complete state, recorded action ordering, deterministic tie
breaks, and defined engine semantics. A state machine alone does not establish
these properties. Persist any GOTO progress that affects future transitions.

Tick number counts simulation advances. Revision orders committed world changes,
including placements and queue edits between ticks. Rejected actions and true
no-ops do not advance revision or create world-change history. Each actual tick
advances tick and revision even if all robots are idle. Exact SQL schema,
historical snapshot strategy, and timeline/fork boundaries remain undecided.
Event sourcing is not selected.

## Implementation readiness

Core architecture and the reviewed behavior rules are approved. No application
implementation has started. Configure and verify dependency versions, test
transforms, package exports, exact DTO/SQL definitions, and transport limits
within the confirmed contracts; record material implementation choices.

Do not silently add behavior if a new ambiguity appears. Module C historical
boundaries remain contingent on selecting that stretch module. Importing a saved
configuration as a new run is not a required feature; existing-run restoration
is already defined. Parser/failure rules and draft disposal are confirmed in
D038–D045, not unresolved design questions.
