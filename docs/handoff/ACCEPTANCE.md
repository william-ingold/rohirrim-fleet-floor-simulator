# Acceptance matrix and behavioral examples

Status: test design. No executable tests or passing results are claimed.
IDs provide traceability from behavior to backend/frontend work. Confirmed rules
are in DECISIONS.md; wire details in CONTRACT.md are draft until reviewed.

## Traceability matrix

| ID | Behavior to prove | Primary level |
| --- | --- | --- |
| E01 | Bounds, sizes 1..20, origin/facing; placements reject obstacles/occupants atomically | Engine |
| E02 | Turns succeed at zero battery; ordinary MOVE consumes one queue item even blocked | Engine |
| E03 | Shared destination compares numeric IDs (R2 beats R10); no loser reconsideration | Engine |
| E04 | Head-on swap blocks both; successful following chain advances together | Engine |
| E05 | Blocked chain propagates backward; stationary occupant prevents entry | Engine |
| E06 | Four-robot rotation succeeds from one snapshot | Engine |
| E07 | Robot iteration order does not change state or outcomes; inputs/nested queues immutable | Engine |
| E08 | Re-placement updates position/facing, preserves battery/queue, resets active GOTO counter; invalid placement preserves all | Engine |
| L01 | Setup->Finish Setup->Paused captures immutable t0; later edits leave t0 intact | Engine/integration |
| L02 | Setup/Paused edits only, setup-only dimensions, Step stays Paused; End terminal | Engine/API/UI |
| L03 | No-op/rejection leaves revision/history unchanged; idle tick advances tick/revision | Engine/application |
| L04 | UI resize rejects out-of-bounds content/GOTO targets without clipping | Engine/API |
| L05 | Cancel deletes draft/history atomically; finalized world cannot Cancel | Persistence/API/UI |
| P01 | Shortest path and NORTH/EAST/SOUTH/WEST equal-first-step tie break | Engine |
| P02 | Other robots' starting cells are walls, even if those robots intend to move | Engine |
| P03 | GOTO stays queued, completes on arrival; at-target consumes tick without successor execution | Engine |
| P04 | Third consecutive no-path tick abandons/logs UNREACHABLE; no path preserves facing | Engine |
| P05 | Found path resets failure count even if movement loses contention; GOTO facing survives blocked MOVE | Engine |
| P06 | Zero battery still permits GOTO planning/at-target completion; behind-head commands do not progress | Engine |
| B01 | Starts at 100; successful MOVE costs 1; blocked/turn/no-path do not | Engine |
| B02 | Zero battery excluded before contention; NO_BATTERY precedes wall/obstacle reasons | Engine |
| B03 | Charge +10 capped at 100 at tick end, including idle/turned/blocked robots | Engine |
| B04 | Zero battery on charger waits, then may move on a later tick; moving onto/off chargers ordered correctly | Engine |
| B05 | Obstacle/charger overlap is legal; charger edit does not charge immediately | Engine/API |
| C01 | Root scenario command works without API/SQLite; CLI default 5 x 5 | CLI integration |
| C02 | Five brief outputs match exactly; numeric ID order/EMPTY/battery report formatting | CLI |
| C03 | Case/whitespace/comments/canonical IDs; reject fractions/exponents/TICK 0/trailing junk | Parser/CLI |
| C04 | Invalid QUEUE batch/unknown robot/illegal placement changes nothing; later lines still run | CLI |
| C05 | Mixed GOTO grammar; invalid targets reject, in-bounds unreachable targets queue | CLI |
| C06 | First valid TICK finalizes setup; REPORT does not; EOF does not drain queues | CLI |
| C07 | Repeated FLOOR replaces setup only; UI resize uses its distinct preserve/reject rule | CLI/engine |
| C08 | Missing file/bad invocation errors on stderr/nonzero; bad lines remain recoverable | CLI process |
| D01 | Full state including queue/GOTO progress survives close/reopen; invalid saved state errors | SQLite integration |
| D02 | Failure after snapshot write/before history completion rolls back both, preserving revision/queues/t0 | SQLite integration |
| D03 | Snapshot and unique world/revision history commit together; failed migration prevents startup | SQLite integration |
| D04 | Restart Playing->Paused is persisted/logged without resetting tick/battery/queues/t0 | API integration |
| A01 | HTTP actions use latest state, not expectedRevision; domain rejection/error envelope is stable | API |
| A02 | Blocked tick is successful HTTP result; no uncommitted state returned/published | API |
| A03 | History pages are revision-ordered, bounded by catch-up upper revision; no duplicate records | API |
| S01 | stream.ready then current snapshot; commit during subscribe is not lost | Real HTTP SSE |
| S02 | Updates publish after commit, in order; rollback emits no state update | API/SSE |
| S03 | Pause/End finish current tick; stale callbacks do not become Steps or tick a later playback generation | Scheduler |
| S04 | Heartbeats every 5s, expiry at 15s; heartbeat creates no revision/history | Presence |
| S05 | One remaining client keeps Playing; last expiry pauses after active tick and logs reason | Scheduler/presence |
| S06 | Refresh within grace avoids forced pause; reconnect after pause/restart needs Play | Integration/UI |
| S07 | Closed/superseded/expired IDs cannot revive leases; listeners/timers/sockets clean up | Presence/SSE |
| S08 | Delivery failure after commit does not undo state; resync recovers missing latest snapshot/history | Integration/UI |
| U01 | UI default 10 x 8; row mapping preserves southwest origin and cardinal facing | UI |
| U02 | Place/select; Up MOVE/Left LEFT/Right RIGHT scoped away from inputs; equivalent buttons | UI |
| U03 | Queues/battery for every robot; append/Clear active GOTO; target input/shift-click | UI |
| U04 | Setup/Paused/Playing/Ended controls, pending errors, immutable baseline semantics | UI |
| U05 | HTTP/SSE duplicate/out-of-order snapshots cannot regress state; history cursor remains independent | UI |
| U06 | Presence registration/reconnect ID/heartbeat teardown; no client-owned ticks | UI |
| U07 | Accessible focus/labels, color-independent status, reduced motion; dense floor inspection | UI/manual |

## Given/When/Then examples

### Contention is not rerun (E03/E05)

Given a 3 x 1 floor, R1 at (0,0) EAST, R2 at (2,0) WEST, and R3 at (1,0)
NORTH, all with MOVE queued and positive battery;
when one tick runs;
then R3 is blocked by the boundary, R1 wins contention but cannot enter R3's
occupied cell, R2 stays a contention loser, and all three MOVE commands are consumed.

### Zero battery does not reserve a destination (B02)

Given R1 at (0,0) EAST with battery 0 and R2 at (2,0) WEST with battery 50,
both targeting empty (1,0);
when one tick runs;
then R1 reports NO_BATTERY, R2 moves and ends at 49, and R1 does not contest it.

### GOTO can turn while blocked (P05)

Given a robot with active GOTO, a found path whose first step changes facing,
and another eligible lower-ID robot contesting that step;
when the tick resolves;
then the GOTO robot keeps the new facing, remains in place, consumes no movement
battery, resets its no-path counter, and keeps GOTO at the queue front.

### Charging is after movement eligibility (B04)

Given battery 0 on a charger and two MOVE commands toward a clear cell;
when the first tick runs;
then the first MOVE is consumed with NO_BATTERY and battery becomes 10;
when the next tick runs;
then the robot may move, leaving the charger with battery 9.

### Invalid batches are atomic (C04)

Given an existing queue;
when the runner reads `QUEUE R1 MOVE UNKNOWN LEFT` and then valid lines;
then no prefix is appended, the process continues, and only explicit REPORTs print.

### Persistence failure cannot consume a command (D02)

Given a stored world with MOVE queued;
when the tick's snapshot update succeeds inside a transaction but history insert fails;
then rollback leaves the prior snapshot/revision/history/queue intact, no SSE
world.updated event is sent, and the API surfaces an error.

### Snapshot/history cursors are distinct (U05)

Given the browser displayed revision 12 with contiguous history only through 8;
when an HTTP response updates displayed state to 15;
then history 9..14 is still fetched/deduplicated; revision 15 is not treated as
proof that earlier history was received.

### Last-client expiry preserves tick atomicity (S05)

Given a Playing world with two leases;
when one lease expires, the other remains live, then the last expires;
then playback continues until the final expiry, completes any active tick,
persists Paused with a no-clients reason, and rejects later scheduled ticks;
when a browser reconnects, then it sees Paused and must explicitly Play.

## Fixture and oracle rules

Keep scenario input and expected stdout separate. Derive expected results from
the brief/approved rules and explicit examples, not production helpers. The
brief battery example is a named exception: approved expected output is 98,
with the original 97 contradiction documented (D010). Do not say every PDF
sample matches when deliberately following the approved conflicting rule.

Prefer table-driven examples and small deterministic permutation checks. A
property-testing package is optional and not required. No arbitrary coverage
percentage substitutes for behavioral coverage. Record each executed check and
result; this file does not imply any test currently passes.
