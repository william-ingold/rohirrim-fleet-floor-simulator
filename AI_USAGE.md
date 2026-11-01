# AI implementation log

## Phase 1 / B1 — 2026-11-01

User authorized only the pure engine slice, requested acceptance selection and
TDD, then required incremental focused Git commits. No agents were delegated.
Existing user edits to planning documents were preserved.

Codex read the master/backend prompts, handoff, decisions, relevant architecture,
brief, frozen contract, resolved review items, and acceptance matrix. Selected
E01–E08, P01–P06, B01–B05 and engine portions of L01–L04. No API/UI built.

Harness: downloaded Node 26.13.0 to /tmp and verified SHA256 against the official
release manifest. Queried official npm metadata and pinned TypeScript 5.9.3,
Vitest 5.0.5, Vite 8.3.5 and @types/node 26.6.6. TypeScript 5.9.3 is an explicit
stable selection, not a claim of latest. npm install reported zero vulnerabilities.
The sandbox could not resolve network hosts; downloads/install required approval.

First red run failed to import the absent engine. A temporary throwing constructor
then let all six construction/edit/lifecycle tests execute and fail. Implemented
immutable snapshots, Robot/Command classes, aggregate edits and lifecycle table;
all six passed. `npm run typecheck` and `npm run build` passed. Refactor removed
an assertion that merely checked method existence. No claim of human review or
AI mistakes caught by the user is made.

Second red run: all 11 movement tests failed (tick and resolver not implemented),
while the original six passed. Added shared-snapshot Command propose/resolve,
independent collective movement resolution, Robot tick effects and World commit.
All 17 tests, strict typecheck and engine build passed. Refactored duplicate turn
planning into a helper and reran checks before committing. Resolver permutations
exercise unsorted robot and intent inputs, not merely sorted World construction.

GOTO/battery increment: first run had 14 failures; four came from incorrectly
using queue arrays as Vitest table rows (arrays were unpacked as arguments).
Codex diagnosed and corrected the table to object rows. The corrected red run
had 11 missing-GOTO failures and 24 passing tests. Implemented BFS first-step
planning, immutable consecutive-failure progress and arrival completion. All 35
tests/typecheck/build passed. Refactored repeated GOTO completion construction.
Battery cost/charging were already part of Robot tick effects, so the additional
non-GOTO battery tests passed on introduction; no red claim is made for them.

Final audit added restored-baseline validation/copy tests, four-direction movement,
explicit snapshot comparisons in permutation tests, and 256 deterministic full-grid
configurations checking occupancy/bounds/battery/one-head/input immutability.
Found that re-placement incorrectly inherited the new-robot NORTH default despite
the frozen contract requiring explicit facing. New test failed (1 failed/41 passed),
then the aggregate guard fixed it (42 passed). Restricted CONTINUING progress to
GOTO at the type boundary and narrowed public exports. This is an AI implementation
mistake caught by its own review/tests, not a claimed user rejection.

Final validation: cached clean reinstall with `npm ci --offline --cache
/tmp/rohirrim-npm-cache --ignore-scripts` succeeded (39 packages, zero reported
vulnerabilities). Then `npm test` passed 42 tests in three files, typecheck and
build passed. An actual ESM import through the built workspace export moved R1
east once and asserted battery 99. `git diff --check` passed. Added README and
B1_RESULTS with exact scope, seam, validation and remaining IDs. Existing user
documentation modifications/design artifacts remain outside these commits.

## Phase 2 / B2 — 2026-11-01

User explicitly authorized B2 only and requested incremental focused commits.
The closing B1 reference was treated as prior-slice context, as stated before
implementation. No agents were delegated; existing planning/design edits are
preserved. Read the master/backend prompts, B1 results, handoff, decisions,
architecture CLI/testing sections, implementation plan, resolved review items,
frozen contract, acceptance matrix, brief and existing references. Selected
C01–C08, exercising the existing E/P/B/L engine behaviors through its built
public workspace export. No engine semantics or contract changes were needed.

First increment: 48 runner tests executed and failed against an explicit throwing
stub. Implemented complete-line parsing, reports, isolated default 5 x 5 World,
setup-only FLOOR replacement, first-TICK t0 capture, manual Steps and EOF End
without draining queues. All 48 passed. Added seven hand-specified input/stdout
pairs (five brief examples, approved battery 98, GOTO/charger detour), preserving
test-scenarios/. Production engine output was not used to generate expectations.
Refactored repeated test execution after green. Cached offline npm install added
one local workspace link and updated the single lockfile without new external
dependencies (zero vulnerabilities reported). Strict typecheck, scenario build,
all 90 tests in four files and git diff --check passed on Node 26.13.0.
The executable/root invocation and process-error checks remain the next increment.

Second increment: added 15 real process tests. The initial sandbox run was
blocked by child-process EPERM; it also exposed a malformed Vitest table row in
the new test code. Corrected the rows to objects and reran outside the sandbox:
all 15 then failed against the executable stub/missing root script. Implemented
read/usage errors on stderr with status 1, report-only executable stdout, and
root scenario/build/test hooks. All 15 passed, including an actual EACCES file
and the mandatory npm invocation. Refactored duplicate success assertions after
green. Three additional audit examples (mixed/occupied-target GOTO, battery-report
setup behavior, numeric contention/re-placement progress) passed on introduction;
no red claim is made for these. Full suite: 108 tests in five files passed,
strict typecheck and both builds passed; git diff --check passed. Process tests
require escalation in this environment. No API/UI or dependency upgrades added.

Final verification: cached clean reinstall via npm ci --offline --cache
/tmp/rohirrim-npm-cache --ignore-scripts added 40 packages with zero reported
vulnerabilities. Full npm test rebuilt both workspaces and passed 108 tests in
five files; strict typecheck passed. Standalone mandatory root invocation of
scenarios/goto-charger.txt built and printed the six independently expected
report lines. Updated README and B2_RESULTS with actual scope, seam, errors,
commands and remaining IDs, including S09/S10/U08 added to the planning matrix
since B1's report. No new decisions or changes to the frozen contract. Ordinary
online npm ci, API integration, frontend readiness, full phase-0 gate,
performance and coverage were not claimed.

## Phase 3 / B3 — 2026-11-01, durable action increment

User authorized B3 persistence only and focused commits. The closing B1 mention
was treated as prior-slice context, consistent with B2; this was stated before
implementation. No agents delegated. Read the required prompts, B1/B2 results,
handoff, decisions, architecture persistence/application sections, plan, resolved
review items, frozen contract and acceptance matrix. Selected D01–D03, D04's
persistence recovery behavior, L05's disposal and application portions of L01–L04.
No HTTP server/controllers, UI, scheduler, SSE or presence implementation.

Verified official npm metadata for better-sqlite3 13.0.3 (Node >=22), Jest 30.2.0
(Node >=24 accepted), @types/better-sqlite3 9.6.0 and @types/jest 30.0.0. Read the
driver's official transaction documentation: immediate transactions commit on
return, roll back on exceptions, and cannot span async work. Installed exact
pins with one lockfile on Node 26.13.0. Sandbox DNS blocked registry queries and
installation; escalated commands succeeded. The native SQLite addon executed.
Install reported 19 vulnerabilities (1 low/18 moderate); a separate actual npm
audit reported 19 (3 low/16 moderate), all in Jest's development tree. No forced
major downgrade/override was applied; this is an unresolved tooling limitation.

Eight real temporary-file SQLite Jest tests ran red against a throwing service
stub, then green after migrations and synchronous BEGIN IMMEDIATE service work.
SQL triggers inject history failure, including observing the written tick before
raising, and draft-history deletion failure. Assertions cover rollback of CREATE,
Finish Setup/t0, MOVE consumption/battery/revision, immutable retained history,
atomic draft disposal, close/reopen with GOTO progress, no-ops and idle ticks.
Refactor narrowed the response helper to metadata it actually uses, eliminating
a fabricated saved-row value. npm run test:persistence passed all 8 after refactor;
npm run typecheck and git diff --check passed. PLAY currently rejects pending
its B5 adapter; startup validation/recovery is the next increment. No complete
D01–D04 claim yet. Existing user documentation/design edits remain untouched.

Startup increment: added recovery/corruption/migration/history tests. Actual red
run: 6 failed, 13 passed (Playing stayed Playing; startup failed to reject corrupt
or unsupported snapshots). Implemented startup validation of every world and
atomic recovery of all Playing worlds with PAUSE/SERVER_RESTART audit entries.
All 19 passed. Extracted recovery from the constructor and corrected fixture
cleanup to close all connections before deleting directories. Five audit tests
passed on introduction (no red claim): active GOTO rollback across reopen,
latest-state callers/terminal End, missing t0, actual deferred-FK COMMIT failure
with one observed attempt, and real competing-writer SQLITE_BUSY. All 24 Jest
checks passed after refactor; strict typecheck and git diff --check passed.
Full npm test outside sandbox built all three workspaces, then passed the prior
108 Vitest engine/CLI tests and 24 Jest SQLite tests (132 total). npm run typecheck
passed. No HTTP/SSE validation is claimed. Tests use saved Playing fixtures to
exercise recovery; PLAY/presence/scheduler remain explicitly deferred to B5.

Final no-op audit found a B3 implementation error: deferred PLAY rejected even
an already Playing world's required no-op. A focused new test ran red (1 failed,
24 passed), then a narrow branch preserved the saved state/revision/history.
New playback still rejects pending the required presence/scheduler adapter; no
unchecked playback bypass was added. All 25 SQLite tests, strict typecheck and
git diff --check passed. Reviewed the small guard; no further refactor needed.
This was caught by Codex's own review/test, not a claimed user correction.

Final setup/documentation verification: sandboxed npm ci --offline --cache
/tmp/rohirrim-npm-cache failed at better-sqlite3's native rebuild; rerunning
outside the sandbox succeeded (435 packages), with deprecation/install-script
notices. Offline output's zero audit findings is not treated as an online audit.
The post-reinstall full suite passed 132 tests before the final Play audit;
final npm test after that fix rebuilt all workspaces and passed 133 tests
(108 Vitest + 25 Jest). Strict typecheck and git diff --check passed. The standalone
root goto-charger scenario printed its six expected lines and built only the
engine/CLI. A real Node ESM smoke executed the B3_RESULTS setup/action example
against a temporary file DB and asserted revision 5, tick 1, default NORTH,
battery 100, consumed queue and OUT_OF_BOUNDS outcome. Updated README/B3_RESULTS
with migrations/pragmas, durable seam, actual red/green commands, audit limits,
partial cross-layer acceptance and exact B4/B5 handoff. No user planning/design
changes were included. No online npm ci, HTTP/browser, power-loss, performance
or coverage claims are made. No skill, agent delegation or external messaging
was used in B3.

## Phase 3 / B4 — 2026-11-01, HTTP action increment

The user corrected the initial B3/B1 ambiguity to phase 3 / B4. Read the provided
master/backend prompts, B3 evidence, frozen contract, decisions, architecture,
resolved review items and acceptance matrix. Selected A01–A03, HTTP portions of
L01–L05 and D04 startup integration; engine E/P/B regressions remain unchanged.
No agents, UI, scheduler, SSE or presence implementation.

Queried official npm metadata outside the sandbox after EAI_AGAIN, pinning Nest
common/core/platform-express 12.3.2, reflect-metadata 0.2.2, rxjs 7.8.2 and
Supertest 7.3.1 in the single lockfile. Consulted official Nest exception-filter
and Supertest documentation. Install reported 19 findings (3 low/16 moderate);
no vulnerability remediation or zero-vulnerability claim. Node 26.13.0 used.

All 42 engine tests passed. Added 17 HTTP/real-SQLite cases and executed them
against a throwing adapter stub: 17 failed. Implemented Nest controllers,
strict unknown-body validation, error filter, committed envelopes and startup
factory owning its DB connection. The first compile caught a Nest 12 adapter
interface mismatch; corrected to the required HttpServer reply capability.
The sandbox blocked Supertest listen with EPERM; rerunning outside the sandbox
passed all 17. Production engine and B3 persistence behavior unchanged.

B4 publication/startup increment: added a post-commit coordinator and explicit
publication stub. New test ran red (1 failed/17 passed), then a broader audit
ran red (2 failed/19 passed): publication absent and bodyless Create rejected.
Implemented synchronous ordered notification, isolated subscriber copies,
unsubscription and delivery/diagnostic error isolation; optional Create body
uses defaults. All 21 HTTP tests passed. Real competing-writer 503, corrupted
snapshot/version 500 and restart-before-HTTP cases passed on introduction, not
claimed red. A hand-authored GOTO JSON fixture, baseline/resize and reentrant
publication audits also passed on introduction. Refactor removed framework
logging dependency from the post-commit seam; no persistence/engine changes.

Both executable tests failed against an explicit stub. Added a localhost
entry point, validated PORT, database ownership, Nest shutdown hooks and root
start/test scripts. A green attempt had 25 passing/1 failing: the test incorrectly
expected status 0 on SIGTERM. Inspected installed Nest lifecycle code (it forwards
the signal after shutdown) and corrected the oracle to SIGTERM. This is Codex's
test mistake, not a product defect or claimed user rejection. Full suite then
passed 159 tests, strict typecheck and diff check. A subsequent content-type
audit found an implementation defect: text/plain Create was ignored and created
a default world. Focused test actually failed (201 vs 400); added a JSON request
guard. Final full npm test rebuilt engine/CLI/API and passed 160 tests (108 Vitest,
25 persistence + 25 HTTP + 2 bootstrap Jest). Strict npm run typecheck and
Git diff check passed. Supertest/CLI process checks required escalation.
No clean reinstall, coverage, performance, browser or real SSE claim in B4.
