# Implementation review prompt

Use in a later session to review actual code; the current handoff has no app code.

---

Review Fleet Floor Simulator against HANDOFF.md, DECISIONS.md, ARCHITECTURE.md,
the frozen CONTRACT.md, and docs/handoff/ACCEPTANCE.md. Inspect code and actual
test output. Do not assume named tests prove their descriptions or claim checks
you have not run. Respect local instructions and user changes.

Prioritize observable defects: sequential instead of simultaneous resolution,
ID text sorting, contention reconsideration, GOTO occupancy/path ties/counters,
wrong facing after blocked GOTO, battery/charging order, queue alias mutation,
CLI partial acceptance/draining/stdout contamination, lost transaction/history,
incorrect startup recovery, stale scheduled ticks, lost subscribe/reconnect
updates, revived leases, client-owned simulation, or falsely optimistic UI state.

Trace one real flow across UI -> HTTP -> application -> engine -> SQLite commit
-> SSE -> UI. Trace a failed history insertion proving rollback and no broadcast.
Trace last-client expiry and reconnect while preserving tick atomicity. Compare
wire fixtures to both API and frontend code; check state/history cursors differ.

Use real database and streaming HTTP checks where those boundaries are claimed.
Review accessibility/motion manually where automated tests cannot establish it.
Verify required root scenario invocation and documented installation, exact
examples except the explicitly approved battery contradiction, custom fixtures,
and honest README/DECISIONS/AI_USAGE/commit history.

Report findings first, ranked by concrete impact, with file locations, trigger,
expected/actual behavior, and the smallest meaningful regression test. Separate
confirmed defects, unresolved assumptions, and optional improvements. No generic
rewrite, extra libraries, speculative security checklist, or unsupported module
scope expansion. If fixing is authorized, reproduce then fix/test in reviewable
slices; otherwise stop at actionable findings.
