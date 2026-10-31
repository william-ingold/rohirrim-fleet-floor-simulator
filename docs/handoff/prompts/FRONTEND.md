# Frontend phase prompt

Use after the master prompt in an authorized implementation session.

---

Implement the Fleet Floor Simulator frontend using Svelte + Vite, TypeScript,
and component/plain CSS. Read docs/handoff/FRONTEND.md, the reviewed CONTRACT.md,
ACCEPTANCE.md U-cases, and the approved output of the UI_UX design prompt.
If the visual spec is not reviewed, request review or produce wireframes/style
proposals first; do not claim an invented palette is user approved.

Selected slice: **[setup/grid / robot inspector and queues / playback and history /
HTTP-SSE-presence integration / accessibility and visual polish]**.
Ask which slice if none is supplied. Use fixtures matching the frozen backend
contract for isolated tests; mark mocks clearly and switch to the real API for
the integration gate. Never ship fixture state as authoritative production data.

Work mainly in apps/web. Do not alter engine rules or backend DTOs unilaterally.
There is no browser simulation loop. Submit HTTP actions against latest server
state and render committed snapshots; revisions order state and history, not
request preconditions. Handle subscription metadata even when state is duplicate.

Use Vitest + Testing Library with behavior-driven test names. Test southwest
origin mapping, placement/selection, scoped arrow shortcuts, queue append/clear,
GOTO target controls, lifecycle restrictions, pending/errors, duplicate/out-of-
order HTTP/SSE updates, independent history cursor, heartbeat cleanup/reconnect,
and no automatic resume after server/last-client pause. Mock transport only at
the UI boundary; verify one real backend smoke path before claiming integration.

Apply the approved bright educational workbench design with tokens. Effects
must communicate committed behavior: free rotation can coexist with blocked
movement, idle robots may charge, reconnect does not replay missed ticks.
Support reduced motion and keyboard focus; do not rely on color alone. Review
dense 20 x 20 display without adding robot/queue limits.

Report changed components, actual tests and manual observations, screenshots if
available, remaining limitations, and exact API/visual-contract questions. Keep
error messages understandable to app users; implementation trivia belongs in
developer docs. Do not invent a timeline/fork, draft archive, login flow, or
multi-floor dashboard beyond agreed scope.
