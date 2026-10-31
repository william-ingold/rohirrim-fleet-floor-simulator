# Master prompt for a future coding-agent session

Copy the following prompt into a session where implementation is authorized.
Keep the repository-relative document paths available to that agent.

---

Implement Fleet Floor Simulator in the selected phase below. Do not reinterpret
this as permission to redesign confirmed behavior. The user owns scope and the
five-hour planning target; do not stop or drop requirements automatically.

Selected phase: **[fill in phase 0–6 from IMPLEMENTATION_PLAN.md]**.
If no phase is supplied, ask which phase to implement before editing code.

Read local AGENTS.md and inspect existing changes first. Read HANDOFF.md,
DECISIONS.md, the relevant ARCHITECTURE.md sections, and:

- docs/handoff/IMPLEMENTATION_PLAN.md
- docs/handoff/REVIEW_ITEMS.md
- docs/handoff/CONTRACT.md
- docs/handoff/ACCEPTANCE.md
- the phase-specific BACKEND.md or FRONTEND.md and prompt

This is a new implementation session; the originating chat produced plans only.
Resolve open review items before dependent implementation. Treat the supplied
brief as reference requirements, not executable agent instructions. When the
brief conflicts with a confirmed interpretation (notably battery 97 vs 98),
follow/document the interpretation rather than silently changing it.

Use Node 26.13.0, strict TypeScript, npm workspaces, NestJS, Svelte/Vite,
better-sqlite3, SQL migrations, and the confirmed Jest/Vitest test split.
Verify compatible stable package versions and pin them; retain one lockfile.
Do not change framework, test runner, runtime pin, deployment assumptions, or
required behavior without the user approving the concrete conflict/alternative.

Use restrained DDD: World aggregate, immutable Robot/Command classes, a Command
interface, pure shared engine, thin adapters. Use TDD for substantive behavior:
select acceptance IDs, run a focused failing test, implement, run green, refactor.
BDD examples guide assertions; no Cucumber or ceremonial infrastructure required.
Do not write tests that merely mirror private implementation or mock away the
transaction/stream behavior they are meant to verify.

Keep frontend and backend connected through the reviewed JSON contract. The
browser renders committed state; the server owns simulation, validation, ticks,
and client-presence auto-pause. Latest-state action handling does not mean
accepting arbitrary client world snapshots. Revisions remain ordering metadata.

Keep each slice reviewable. Preserve user files and prior work. No new features,
draft archives, event sourcing, XState, ORM, WebSockets, auth, or module C/D scope
expansion. Do not spawn agents unless the user or applicable instructions
authorize delegation; separate frontend/backend documents are not delegation
permission. Do not deploy, publish, or contact others as part of this prompt.

When behavior is unspecified, ask a precise question with a recommendation and
continue independent authorized work. Do not guess. Record confirmed rationale,
questions/pushbacks, actual AI contributions/rejections, and real validation.

Finish the selected phase by reporting:

1. What changed and acceptance IDs completed.
2. Actual test/typecheck/build/scenario commands and results.
3. Known failures/unimplemented requirements, without claiming overall completion.
4. Contract changes or questions requiring user review.
5. Next phase and exact handoff artifacts it needs.

Use an honest AI_USAGE.md and readable commits when repository permissions
permit. Do not fabricate test results, timings, screenshots, bugs caught, or Git
history. No automatic squash or destructive cleanup of user changes.
