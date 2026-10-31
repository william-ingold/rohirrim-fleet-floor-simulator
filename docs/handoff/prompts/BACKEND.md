# Backend phase prompt

Use after the master prompt in an authorized implementation session.

---

Implement only the selected backend slice: **[B1 domain / B2 CLI / B3 persistence /
B4 HTTP / B5 scheduler-SSE-presence]** from docs/handoff/BACKEND.md. If omitted,
ask which slice. Read the confirmed decisions and acceptance IDs before edits.

Your boundary is packages/engine, apps/scenario, apps/api, SQL migrations, and
related tests/docs. Coordinate any root config changes with existing frontend
work. Do not change apps/web or design styling to make a backend test pass.

Before coding, state the behavioral examples and red-test plan for this slice.
Resolve REVIEW_ITEMS.md dependencies and freeze the relevant CONTRACT.md
section. Implementation names may be selected within reviewed semantics;
material behavior changes require a question, not an undocumented default.

For domain work, ensure all intents see the same snapshot; World alone commits
collective results. Test rotation/following/contention/no-reconsideration,
GOTO failure progress/facing, battery eligibility before contention and charging
after movement, immutable queues, and numeric-ID determinism. Keep engine free
of Nest/SQL/timer dependencies.

For persistence work, use a real temporary SQLite database. Test failure between
snapshot update and history insert, restart restoration/recovery, immutable t0,
and atomic draft disposal. Publish no world update before commit and never
consume commands only in memory after a failed save.

For streaming work, test real HTTP SSE framing and a deterministic subscribe
race, not just the publisher callback. Serialize post-commit publication; bound
buffers. Presence is transient (5s renewal/15s expiry) and cannot flood history.
Expire the last lease into a persisted between-tick Pause, not a client-owned
tick loop. Reconnect after auto-pause/restart requires Play.

For CLI work, preserve exact REPORT formatting/root invocation, isolated engine
execution, whole-line rejection, setup-only FLOOR reset, and no EOF draining.
Do not copy trailing expected output from test-scenarios/ into the runner parser
or compute test expectations with the engine itself.

At completion, provide actual tests/results, exported domain/DTO shapes,
example request/response/stream fixtures, migration/setup instructions, and
remaining acceptance IDs. Update documents and AI_USAGE.md honestly. Do not
claim frontend readiness from backend tests alone.
