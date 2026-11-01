# Phase 1 / B1 implementation results

Authorized slice: pure engine only. This is not completion of the application or
the full phase-0 harness gate. No API, UI, CLI, database, migrations, HTTP/SSE,
presence, scheduler, Jest configuration, deployment or module C was implemented.
Existing user planning edits and concurrently appearing design files were left
out of implementation commits.

## Acceptance evidence

| IDs | Evidence/status |
| --- | --- |
| E01 | Dimensions 1..20; atomic placement/obstacle rejection; four cardinal moves from southwest origin; canonical IDs and allocation |
| E02 | Zero-battery turns; blocked MOVE consumed; one head processed per tick |
| E03–E06 | Numeric contention; no reconsideration; swaps; successful/blocked following; stationary/turning occupancy; four-robot rotation |
| E07 | Direct resolver permutations of unsorted robots/intents; explicit World snapshot/outcome comparison; nested runtime immutability; 256 configuration invariant check; invalid hydration rejected |
| E08 | Re-placement preserves battery/queue and resets only active GOTO progress; rejected replacement unchanged; explicit facing required |
| P01–P06 | Shortest detour and first-step preference; starting occupancy walls; retained GOTO/arrival/at-target completion; third no-path abandonment with UNREACHABLE; progress/facing after contention; zero-battery planning; no behind-head progress |
| B01–B05 | Starts at 100; move-only cost; battery-first eligibility/reasons; charging cap and idle/turn/blocked/no-path charging; move-on/off ordering; independent overlapping features and no immediate charging |
| L01 | Engine portion passed: immutable Paused tick-zero baseline; later edits/ticks preserve it; baseline restoration validates/copies supplied t0. Durable capture remains B3 |
| L02 | Engine portion passed: lifecycle table, edit guards, setup-only resize, Paused Step and terminal End. API/UI portions remain |
| L03 | Engine portion passed: same-instance true no-ops, atomic rejection, idle tick advances logical time. Revisions/history are application metadata and remain B3 |
| L04 | Engine portion passed: preserve/reject resize checks robots/features/all GOTO targets. API/UI portions remain |

42 tests in three files pass. The 256 configurations are one test with a loop,
not 256 separately reported tests. Tests use explicit expected positions/reasons,
queues, batteries and paths; production engine outputs are not used as fixture
oracles. Permutation and invariant checks supplement those expectations.

## TDD and actual validation

All execution used the verified Linux Node 26.13.0 runtime unpacked under
`/tmp/node-v26.13.0-linux-x64`, with its bin directory prepended to PATH. The
environment initially had only a Windows npm shim and no usable Linux Node.
Node archive SHA256 matched the official release manifest. Official release and
npm metadata were used to verify/pin dependencies. Network downloads/install
required sandbox escalation. One root lockfile is retained.

| Actual command/check | Result |
| --- | --- |
| `npm run test:engine -- packages/engine/test/world.test.ts` | Initial red: absent engine module, no tests executed |
| `npm run test:engine` after throwing constructor stub | Red: six construction/edit/lifecycle tests executed and failed |
| `npm run test:engine` after domain implementation | Green: 6 passed |
| `npm run test:engine` with movement tests | Red: 11 failed, 6 passed; tick/resolver missing |
| `npm run test:engine` after movement implementation/refactor | Green: 17 passed |
| `npm run test:engine` with GOTO/battery tests | Initial 14 failures included malformed Vitest table rows; corrected table yielded 11 missing-GOTO failures, 24 passed |
| `npm run test:engine` after GOTO implementation/refactor | Green: 35 passed |
| `npm run test:engine` with final audit tests | Red: missing replacement-facing guard; 1 failed, 41 passed |
| `npm run test:engine` after guard/export/type refinements | Green: 42 passed |
| `npm ci --offline --cache /tmp/rohirrim-npm-cache --ignore-scripts` | Clean reinstall from cached lockfile: 39 packages installed; audit reported zero vulnerabilities |
| `npm test` after clean reinstall | 3 files, 42 tests passed |
| `npm run typecheck` | Passed, including tests; strict TS + unchecked-index and exact-optional checks |
| `npm run build` | Passed; declaration and ESM output built |
| Node ESM import of built `@rohirrim/engine` | Passed: one queued EAST move ended x=1, battery=99 |
| `git diff --check` | Passed |

Targeted checks were rerun around refactors. No API/integration/scenario commands
were run; those adapters do not exist. No performance or coverage claims made.
The cached clean reinstall disabled install scripts; ordinary online `npm ci`
is documented as setup but was not separately executed.

## Public engine seam

`packages/engine/src/index.ts` deliberately exports World, Robot, the Command
interface and four immutable concrete commands; snapshot/input/outcome types;
and the independently testable movement resolver. No HTTP envelope is invented.

World construction/edit methods return new Worlds. A true no-op returns the
same instance. DomainError carries INVALID_REQUEST, INVALID_PLACEMENT or
INVALID_LIFECYCLE. Rejections leave the original aggregate intact. The future
application adapter owns transactions/revisions/history/error-to-HTTP mapping.

```ts
World.create(width = 10, height = 8)
World.restore(snapshot: unknown, baseline?: unknown)
world.snapshot // deeply frozen WorldSnapshot, matching CONTRACT.md
world.baseline // separately held frozen WorldSnapshot | null
world.placeRobot(position, robotId?, facing?)
world.setObstacle(position, enabled)
world.setCharger(position, enabled)
world.resize(width, height)
world.enqueue(robotId, commands) // nonempty atomic CommandInput batch
world.clearQueue(robotId)
world.finishSetup() // captures t0; enters Paused without advancing tick
world.play(); world.pause(); world.end()
world.step() // Paused only; returns TickResult
world.automaticTick() // Playing only; same engine pipeline
```

Snapshots keep exactly the contract's width/height/tick/lifecycle, obstacles,
chargers and complete robots/queues/progress. Coordinates serialize by y then x;
robots by numeric ID. Input commands omit progress; retained GOTO progress is
0..2 and only queue head may carry nonzero progress. Only World commits collective
tick results. Robot and Command propose/resolve methods cannot mutate a World.

```ts
type TickResult = { readonly world: World; readonly outcomes: readonly RobotTickOutcome[] };
type Movement =
  | { readonly status: 'NOT_ATTEMPTED' | 'SUCCEEDED' }
  | { readonly status: 'BLOCKED'; readonly reason: BlockedReason; readonly blockerId?: string };
type CommandProgress =
  | { readonly status: 'NONE' }
  | { readonly status: 'COMPLETED'; readonly type: 'MOVE' | 'LEFT' | 'RIGHT' | 'GOTO' }
  | { readonly status: 'CONTINUING'; readonly type: 'GOTO' }
  | { readonly status: 'ABANDONED'; readonly type: 'GOTO'; readonly reason: 'UNREACHABLE' };
// RobotTickOutcome: robotId, resulting position/facing/battery, movement, command.
```

Example in-process use and outcome (not an HTTP request/response):

```ts
const result = World.create(2, 1)
  .placeRobot({ x: 0, y: 0 }, 'R1', 'EAST')
  .enqueue('R1', [{ type: 'MOVE' }]).finishSetup().step();
// result.outcomes:
// [{ robotId: 'R1', position: { x: 1, y: 0 }, facing: 'EAST', battery: 99,
//    movement: { status: 'SUCCEEDED' }, command: { status: 'COMPLETED', type: 'MOVE' } }]
```

Implementation choices within approved semantics: BFS with NORTH/EAST/SOUTH/WEST
expansion, ordered one-time contention, dependency traversal with permitted longer
cycles, deep defensive snapshot copies/freezes, native private Robot/World fields,
and typed lifecycle table. Commands use propose/resolve without inheritance.
No arbitrary queue limits. TypeScript 5.9.3 is a verified stable compatible pin,
not a claim of latest. Vitest 5.0.5, Vite 8.3.5 and @types/node 26.6.6 were
verified against official npm metadata and exercised on the pinned runtime.

## Remaining work and next handoff

No known failing B1 tests; frozen CONTRACT.md unchanged. No new behavioral
questions require user review. Playback generation/presence remain mandatory
application checks; calling automaticTick only verifies domain lifecycle.
Snapshot version checks and durable t0/revision/history coherence belong to the
repository/application boundary. Pass the separately persisted baseline when
rehydrating a stored world; snapshot-only restoration does not recover t0.

Remaining acceptance IDs: **L01–L04 cross-layer portions, L05, C01–C08, D01–D04,
A01–A03, S01–S08, U01–U07**. Completed engine IDs: **E01–E08, P01–P06, B01–B05**.
The full phase-0 gate (two test runners and adapter imports) is not claimed.

Next authorized slice would be **phase 2 / B2 scenario adapter**, requiring a
new authorization. Read this report, README.md, HANDOFF.md, DECISIONS.md,
ARCHITECTURE.md's CLI lifecycle/testing sections, IMPLEMENTATION_PLAN.md,
BACKEND.md B2, ACCEPTANCE.md C01–C08, CONTRACT.md and prompts/IMPLEMENT.md then
prompts/BACKEND.md. Use the engine's built export and existing engine tests.
Preserve test-scenarios/ as references; create independent input/expected-output
pairs under scenarios/. Do not copy trailing expected output into the parser.
No migration setup, HTTP fixture or stream fixture exists yet; those belong to
later authorized slices and must follow the frozen seam before integration.
