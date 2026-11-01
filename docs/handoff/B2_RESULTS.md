# Phase 2 / B2 implementation results

Authorized slice: CLI adapter only, using the existing built public engine.
No API, UI, SQLite, migrations, HTTP/SSE, scheduler, presence or module C work.
The explicit B2 authorization was followed; the closing B1 mention was treated
as prior-slice context and this interpretation was stated before implementation.
Existing planning/design edits and test-scenarios/ references were preserved.

## Acceptance evidence

| IDs | Actual evidence/status |
| --- | --- |
| C01 | Real root `npm run scenario -- scenarios/chain.txt` process test; independent 5 x 5 worlds; imports @rohirrim/engine; no API/database dependencies |
| C02 | Five brief examples match exact separate stdout fixtures in runner and executable tests; numeric R2/R10 sorting; EMPTY; battery formatting; approved battery sample is 98, deliberately differing from brief's 97 (D010) |
| C03 | Mixed case, CRLF, tabs/comma spacing, leading-zero ID aliases; rejects signs, fractions, exponents, unsafe integers, R0, TICK 0, inline comments and trailing junk |
| C04 | Invalid queue prefix appends nothing; unknown robot/illegal placement/feature lines leave state unchanged; later reports/ticks execute; invalid lines exit successfully |
| C05 | Mixed primitive/GOTO batches with comma spacing; out-of-bounds target rejects whole batch; obstacle/robot-occupied targets accepted; retained no-path progress/third-tick abandonment; detour fixture |
| C06 | Reports leave setup open; first valid TICK captures paused t0; invalid ticks do not; paused edits preserve baseline; EOF finishes/Ends with pending queue intact and no extra tick/report |
| C07 | Valid setup FLOOR clears robots/features/queues; invalid FLOOR unchanged; post-tick FLOOR ignored; UI/engine resize behavior untouched |
| C08 | Real process checks: missing/extra arguments, missing file, directory, permission-denied file (EACCES), filenames with spaces/another cwd; readable stderr and exit 1 for runner errors |

Existing E01–E08, P01–P06, B01–B05 and engine portions of L01–L04 remain green.
Additional adapter tests exercise numeric contention, swaps/following/rotation,
re-placement continuity, GOTO failures and battery/charging through the engine.
No domain production files changed.

## TDD and actual validation

All commands used Node 26.13.0 from `/tmp/node-v26.13.0-linux-x64/bin`, prepended
to PATH. No external dependencies or version changes were introduced. The new
workspace depends on the existing local @rohirrim/engine 0.1.0; one lockfile remains.

| Actual command/check | Result |
| --- | --- |
| `npm exec -- vitest run apps/scenario/test/runner.test.ts --reporter=dot` against throwing runner stub | Red: 48 executed, 48 failed |
| Same runner command after implementation | Green: 48 passed |
| `npm install --offline --cache /tmp/rohirrim-npm-cache --ignore-scripts` | One local workspace link added; zero vulnerabilities reported |
| `npm run typecheck`, `npm run build --workspace @rohirrim/scenario`, `npm test` after runner refactor | Passed; 90 tests in four files |
| `npm exec -- vitest run apps/scenario/test/process.test.ts --reporter=dot` in sandbox | Failed: child spawning blocked with EPERM; malformed argument table also corrected; not claimed as behavioral red evidence |
| Same process command outside sandbox, against executable stub/missing root script | Red: 15 executed, 15 failed |
| Same process command after executable/root command implementation | Green: 15 passed; EACCES case executed, no skipped tests |
| `npm test` after success-assertion refactor and three acceptance audit examples | Green: 108 tests in five files (42 engine, 51 runner, 15 process) |
| `npm ci --offline --cache /tmp/rohirrim-npm-cache --ignore-scripts` | Clean cached reinstall: 40 packages added, zero vulnerabilities reported |
| `npm test` after clean reinstall | Both builds passed via pretest; all 108 tests passed |
| `npm run typecheck` after clean reinstall | Passed, including engine/CLI tests under strict TS |
| `npm run scenario -- scenarios/goto-charger.txt` after clean reinstall | Passed; automatic build and six expected report lines |
| `git diff --check` | Passed |

Tests read hand-specified input/expected-output pairs; they do not generate
expectations with the production engine. Three final audit examples passed on
introduction; no red claim for those. No performance/coverage claim. Ordinary
online npm ci was not separately executed. This environment requires escalation
for Git writes and Vitest child-process tests; ordinary build/typecheck and the
standalone root command ran inside the sandbox.

## Adapter seam and invocation

`apps/scenario/src/parser.ts` parses a whole line into ScenarioAction or null.
It validates syntactic integers/IDs and mixed command batches before applying
anything; World validates domain bounds/occupancy. `runner.ts` exports:

```ts
type ScenarioResult = { readonly world: World; readonly stdout: string };
runScenario(input: string): ScenarioResult
```

Each call owns a fresh World. Only DomainError rejections are ignored while
applying a line; unexpected faults propagate to the executable's error path.
Reports inspect state; TICK uses finishSetup/step; EOF uses finishSetup/end.
Returned World allows tests to inspect preserved queues/baseline after EOF.
No HTTP DTOs or public package exports were added. The engine seam is unchanged.

Root `npm run scenario -- path/to/scenario.txt` builds engine then CLI. npm emits
script banners; `node apps/scenario/dist/main.js path/to/scenario.txt` after a
build emits only REPORT output. Errors go to stderr/status 1. Example:

```text
# scenarios/battery.txt (input)
FLOOR 3,1
PLACE R1 0,0,EAST
QUEUE R1 MOVE MOVE MOVE
TICK 3
REPORT
REPORT BATTERY
```

```text
R1 2,0,EAST
R1 98
```

No database or migration setup, request/response/stream fixtures exist in B2;
those belong to later authorized slices. CONTRACT.md remains frozen/unchanged.

## Remaining work and next handoff

No known failing B2 tests or unresolved behavioral questions. Application and
full phase-0 harness completion are not claimed: no Nest/Jest adapter import
checks exist yet. No frontend readiness claim.

Remaining acceptance IDs: **L01–L04 cross-layer portions, L05, D01–D04, A01–A03,
S01–S10, U01–U08**. B1's older remainder list predates S09/S10/U08; the current
matrix includes them. Completed CLI IDs: **C01–C08**.

Next work requires new authorization: **phase 3**, beginning with **B3 persistence**
and then **B4 HTTP** as selected (implementation-plan phases and backend slices
are not one-to-one). Read prompts/IMPLEMENT.md then prompts/BACKEND.md,
B1_RESULTS.md, this report, README.md, HANDOFF.md, DECISIONS.md, ARCHITECTURE.md
persistence/application sections, IMPLEMENTATION_PLAN.md, BACKEND.md B3/B4,
REVIEW_ITEMS.md, CONTRACT.md and ACCEPTANCE.md L/D/A cases. Retain the public
engine export, new CLI fixtures and actual process tests as regression checks.
