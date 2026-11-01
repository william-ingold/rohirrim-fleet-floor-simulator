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
