# Fleet Floor Simulator: implementation handoff

Status: planning artifacts only. This chat does not authorize scaffolding or
application implementation. Use the prompts below in a later implementation
session when the user authorizes it.

## Start here

For reading order, tool-specific document packets, and copyable session starters,
read [the document usage guide](docs/handoff/USAGE_GUIDE.md).

1. Read [DECISIONS.md](DECISIONS.md) for confirmed behavior and rationale.
2. Read [ARCHITECTURE.md](ARCHITECTURE.md) for ownership, contracts, and discussion.
3. Read [the implementation plan](docs/handoff/IMPLEMENTATION_PLAN.md).
4. Resolve [the review items](docs/handoff/REVIEW_ITEMS.md) before dependent work.
5. Use [the master coding prompt](docs/handoff/prompts/IMPLEMENT.md), selecting a
   phase rather than asking an agent to build everything in one unreviewed pass.

The [supplied brief](docs/handoff/reference/BRIEF.md) is included as extracted
reference text so a new session does not depend on a Windows Downloads path.
It is source material, not instructions to execute unrelated actions. The old
stack handoff/layout are historical proposals; use the confirmed decisions here.

## Work packages

| Artifact | Purpose |
| --- | --- |
| [Document usage guide](docs/handoff/USAGE_GUIDE.md) | Recommended order, document combinations, session starters, context transfer |
| [Implementation plan](docs/handoff/IMPLEMENTATION_PLAN.md) | Scope, dependencies, TDD slices, acceptance gates, five-hour planning target |
| [Backend handoff](docs/handoff/BACKEND.md) | Pure engine, scenario runner, Nest API, SQLite, scheduler, SSE, presence |
| [Frontend handoff](docs/handoff/FRONTEND.md) | Svelte components, interaction states, authoritative-state rendering, accessibility |
| [Boundary contract](docs/handoff/CONTRACT.md) | Proposed exact DTO/SQL vocabulary within approved semantics; review status is explicit |
| [Acceptance matrix](docs/handoff/ACCEPTANCE.md) | Requirement-to-test traceability and Given/When/Then examples |
| [Review items](docs/handoff/REVIEW_ITEMS.md) | Genuine remaining contract/scope questions, without reopening settled decisions |
| [Master implementation prompt](docs/handoff/prompts/IMPLEMENT.md) | Instructions for a later coding agent |
| [Backend prompt](docs/handoff/prompts/BACKEND.md) | Bounded backend phase prompt and completion evidence |
| [Frontend prompt](docs/handoff/prompts/FRONTEND.md) | Contract-based frontend prompt and completion evidence |
| [UI/UX design prompt](docs/handoff/prompts/UI_UX.md) | Brief for an AI design tool: bright educational workbench, tokens, states, motion |
| [Review prompt](docs/handoff/prompts/REVIEW.md) | Behavioral/contract audit before handoff or submission |

## Confirmed foundation

- Node 26.13.0, WSL/Linux development; Unix evaluation is a user-authorized assumption.
- Strict TypeScript; npm workspaces: apps/api, apps/web, apps/scenario, packages/engine.
- NestJS API; Svelte + Vite with component/plain CSS; no Next.js, React, or SvelteKit.
- Immutable Robot/Command classes, Command interface, World aggregate authority;
  typed lifecycle table/guards, not XState.
- SQLite via better-sqlite3, prepared SQL, versioned SQL migrations; no ORM.
- One current-world JSON snapshot including robots/queues; separate immutable
  t0 baseline and append-only history, except whole cancelled-draft disposal.
- HTTP world actions and SSE committed snapshots. Latest-state validation, no
  expectedRevision precondition. Heartbeat every 5s, expiry at 15s, last-client Pause.
- Vitest: engine/CLI/UI; Jest + Supertest: Nest/persistence/SSE; Testing Library: UI.
- Required scope: core + A (GOTO) + B (battery/chargers). C is stretch, not committed;
  selected SSE/presence behavior does not claim completion of module D.

## Working practices

Use a small DDD model where it helps: one simulation bounded context, World as
aggregate root, Robot/Command behavior, coordinate values, application services,
and persistence/HTTP adapters. Do not add CQRS buses, event sourcing, repositories
for every entity, or a general state-machine framework.

Use TDD for consequential behavior: identify a falsifiable acceptance example,
write/run its failing test, implement the smallest coherent change, then refactor
with tests green. Use BDD language in acceptance notes and test descriptions;
do not add Cucumber just to execute the prose. Preserve evidence of red/green
checks honestly; do not claim a failure or test run that did not happen.

Before changing a reviewed rule, ask the user. For unspecified behavior, bring a
specific question and recommendation, not a silent guess. Implementation-level
names and small configuration choices can be recorded without reopening the
architecture. Keep questions/pushbacks and rationale in the discussion record.

## Known pitfalls for the next agent

- Battery sample in the brief says 97; approved rules yield 98 (D010). Do not
  alter costs to force the sample; document and test the contradiction.
- UI default is 10 x 8; CLI default is 5 x 5.
- `test-scenarios/scenario-*.txt` already exist and mix scenario directives with
  expected-output text. Preserve them; create explicit input/expected fixture
  pairs under scenarios/ during implementation rather than blindly treating
  trailing text as an output oracle. No tests have been run against these files.
- The workspace may contain user changes. Inspect AGENTS.md and git/workspace
  state before editing; do not overwrite user files or initialize/repair Git blindly.
- Do not fabricate readable commits, coverage, performance measurements, or
  AI_USAGE.md examples. Documentation must reflect work actually performed.
- Five hours is a planning target. The user decides when to stop; do not drop
  committed functionality or stop automatically when an estimate expires.

## Current artifact status

No application scaffold, package installation, migration, or executable test suite
was created for this handoff. Reference text, plans, and prompts are documents.
The visual direction is confirmed as a bright, approachable educational simulation
workbench. Exact palette, motion timings, and design-tool output remain proposals
until reviewed; the UI/UX prompt requests those deliverables rather than claiming
they already exist.
