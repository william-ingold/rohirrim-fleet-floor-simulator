# Implementation plan

Start with [HANDOFF.md](../../HANDOFF.md). Status: execution plan, not application code.

## Scope and dependency order

Complete core and modules A/B. Keep C as stretch. Do not build a timeline/fork,
auth system, draft archive, collaborative cursors, WebSocket commands, mobile
application, or multi-process hosting unless separately requested. Restore a
world by URL identity; a multi-floor management dashboard is not required.

Backend includes the pure domain engine, scenario adapter, database, HTTP,
playback scheduler, SSE, and presence. Frontend includes rendering, browser-side
interaction, HTTP/SSE integration, heartbeat renewal, accessibility, and motion.
The browser never becomes a second simulation engine.

The shared boundary is JSON snapshots/actions/outcomes. CONTRACT.md is approved
and frozen for the documented boundary (D060–D062); create matching fixtures during
authorized implementation before backend and frontend integrate. Frontend
wireframes and component work can use fixtures while backend is built, but this
does not authorize spawning agents or changing the API independently.

## Phases and completion gates

| Phase | Work | Observable gate | Planning allocation |
| --- | --- | --- | --- |
| 0 | Resolve review items; dependency/export/test harness setup | Engine imports from CLI/API; two test runners load; no infrastructure in engine | 20 min |
| 1 | World/Robot/Command, lifecycle, simultaneous ticks, GOTO, battery | Engine-level E/L/P/B cases pass, permutation/immutability checks pass | 85 min |
| 2 | Scenario parser/runner/report fixtures | Root command works without server; exact outputs and error recovery verified | 30 min |
| 3 | Migrations/repository/application service/HTTP | Real SQLite restoration and failure-injection rollback checks pass | 55 min |
| 4 | Scheduler/SSE/presence/recovery | Ordered post-commit updates, reconnect race, last-client Pause checks pass | 45 min |
| 5 | Svelte UI and reviewed visual direction | All required flows work against actual API; UI interaction tests pass | 45 min |
| 6 | End-to-end smoke, docs, handoff | Required commands/docs and honest limitations documented | 20 min |

Allocations total 300 minutes and are estimates, not measured feasibility or a
promise. SSE recovery and dual test transforms are the highest integration risks.
UI design artifacts may be prepared before implementation time begins. At each
gate report remaining work and budget pressure; only the user may stop work or
reduce committed scope. Reduce decoration before functional correctness when
the user requests prioritization; never silently omit A/B or approved reliability.

## Slice discipline

For each phase, work in vertical, reviewable slices:

1. Identify acceptance IDs from ACCEPTANCE.md and the confirmed decisions.
2. Write a focused failing behavior test, execute it, and inspect why it fails.
3. Implement that behavior at its proper boundary.
4. Run the targeted tests, then the affected package checks; refactor when green.
5. Update decision/AI usage notes only for real changes and observations.
6. Report completed IDs, actual commands/results, limitations, and the next slice.

Use real SQLite for persistence behavior. Mock failure at a statement boundary
when necessary, not the entire repository. Use fake/injected application clocks
for expiry/scheduling; do not introduce clocks into the domain engine. Inspect a
real HTTP SSE stream as well as testing the observable in isolation.

## Proposed module organization

```text
packages/engine/src/
  world.ts                  # aggregate and transitions
  robot.ts                  # immutable robot operations
  commands/                 # interface and concrete commands
  movement.ts               # collective intent resolution
  pathfinding.ts            # four-neighbor shortest paths
  snapshots.ts              # validated serializable domain shapes
  lifecycle.ts              # explicit transition table/guards
  index.ts                  # deliberate public exports
apps/scenario/src/
  main.ts, parser.ts, reporter.ts
apps/api/src/
  floors/                   # thin controller, application service, DTOs
  persistence/              # better-sqlite3 and migration runner
  playback/                 # scheduler and presence outside engine
  streaming/                # ordered committed updates and SSE adapters
apps/web/src/
  components/, lib/, App.svelte, app.css
```

Filenames locate responsibilities; they do not demand a class per file or empty
abstraction layer. Exact Robot/Command method signatures are design sketches;
preserve immutable propose/resolve semantics rather than copying them blindly.

## Root developer experience

Provide a documented clean-install path, Node pin, one package-lock.json, root
dev/build/typecheck/test commands, and the mandatory root command:

```sh
npm run scenario -- path/to/scenario.txt
```

Do not require the API or database to run a scenario. Ensure public workspace
exports resolve after documented setup; do not assume tsx bypasses package
exports or Nest decorator requirements. Verify compatible stable dependency
versions during scaffolding and pin them. Do not float latest or change the
approved Node pin without discussing incompatibility.

Application stdout contains only REPORT output for the runner; npm may print its
own script banners. Test executable REPORT output separately and preserve the
required invocation. Document the banner ambiguity rather than claiming npm
produces no extra stdout or changing the required command.

## Definition of implementation completion

- Traceable acceptance coverage beyond the brief examples; no invented results.
- CLI examples, custom fixtures, core/A/B behavior, restoration, transaction
  rollback, lifecycle restrictions, SSE recovery, and presence auto-pause verified.
- Browser can create/setup/finish/play/pause/step/end and inspect history/queues.
- Input errors do not crash scenarios; persistence errors do not fabricate state.
- README.md, DECISIONS.md, ARCHITECTURE.md, AI_USAGE.md accurately describe final work.
- Preserve a readable commit history when Git access permits; do not fabricate
  commits or squash history without instruction.
- Report unfinished requirements explicitly; do not label a partial slice as
  the completed application.
