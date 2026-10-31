# Frontend implementation handoff

Audience: coding agent implementing authorized UI phases. Read HANDOFF.md,
DECISIONS.md, CONTRACT.md, ACCEPTANCE.md, and the reviewed output of UI_UX.md.
No application code is authorized in the current planning chat.

## Product and design direction

Build a bright simulation workbench: approachable, clear, educational. The floor
and consequences of queued commands are central. Prefer readable controls,
coordinate labels, clear robot facing, and explanatory outcomes over decoration.
Svelte + Vite, TypeScript, plain/component CSS. No React/Next/SvelteKit, UI-kit
dependency, canvas game engine, or generated marketing site by default.

Palette/motion proposals from the design tool are not domain decisions. Review
them before coding. Use CSS variables for approved tokens, accessible contrast,
icons/labels as well as color, and reduced-motion behavior. No generated raster
artwork is required to understand the simulator.

## Suggested components and state ownership

| Component | Responsibility |
| --- | --- |
| WorldSetup | Dimensions/default 10 x 8, draft editing context, Finish Setup, Cancel |
| FloorGrid | Cell coordinates/features, robot identity/facing, selection/target intents |
| PlaybackControls | Lifecycle, tick, Play/Pause/Step/End, reviewed speed control |
| RobotInspector | Selected robot, battery, ordered queue, command append and Clear |
| EditToolbar | Explicit mutually exclusive placement/obstacle/charger tools |
| RobotList | Every robot's pending queue/battery, with selected-row navigation |
| HistoryPanel | Paginated revision-ordered committed events and outcome detail |
| ConnectionStatus | Connecting/live/reconnecting, lease issue and recoverable errors |

These are responsibility suggestions, not a demand to create all files upfront.
Transport client/store lives under lib/; components render and emit user intent.
Only ephemeral UI state belongs in the browser: selection, tool, input drafts,
panel state, local motion preferences, reviewed speed selection. Server snapshots
own positions, queues, battery, lifecycle, tick, and history. Do not call the
domain engine in the browser to predict authoritative results.

## Interaction contract

- Origin is bottom-left; x increases right/east and y increases up/north. Array
  row/render order must not invert robot coordinates. Show axes/compass clearly.
- Outside feature-edit mode, clicking an empty cell requests a new NORTH-facing
  robot; server allocates smallest free numeric ID. Clicking a robot selects it.
- Selected robot: Up queues MOVE, Left queues LEFT, Right queues RIGHT. Up means
  forward relative to facing, not absolute NORTH. Do not add a reverse command.
- Shift-click issues GOTO when editable; supply an explicit target-input/control
  alternative for touch and keyboard users. In-bounds unreachable targets remain
  legal commands; explain waiting/UNREACHABLE, do not block them in the UI.
- Arrow bindings must not hijack typing in text/number inputs or normal unrelated
  page navigation. Scope shortcuts to the simulator interaction area and expose
  visible buttons with the same semantics. Avoid accidental repeated key queues.
- Feature edits send desired enabled values. Obstacle/charger can coexist, but
  obstacle placement on a robot is rejected. Distinguish tool intent from state.
- Show each robot's complete pending order, including active GOTO target/progress.
  Clear cancels all pending commands and active GOTO, never moves/recharges it.
- Only Setup/Paused allow edits. Setup also allows dimensions; resizing must not
  clip existing contents. Finish Setup establishes t0; do not relabel it Play.
- Play requests server scheduling; Pause/End wait for an in-progress tick to
  complete. Show pending controls without pretending a transition committed.
- Step advances one tick and remains Paused. Ended remains inspectable and
  read-only. Cancel deletes only unfinished setup and navigates after success.

## Lifecycle presentation

| State | Required affordances |
| --- | --- |
| Setting Up | Dimensions, placement/features, queues, Finish Setup, Cancel; no tick execution |
| Paused | Edit tools, queue controls, Play, Step, End; dimensions locked |
| Playing | Pause/End and inspection; editing disabled with a clear explanation |
| Ended | Final floor/queues/history; no edit, Play, Step, or reset of that world |
| Connecting/reconnecting | Transport overlay/status, retained last-known view labelled as such; never claim server Paused |

Connection/pending/error states are UI states, not additional persisted World
lifecycle states. Do not hide errors with fake successful optimistic updates.

## API and SSE integration

One mutation in flight at a time is the proposed simple client strategy. Apply
successful HTTP/SSE snapshots through one reducer using (worldId, revision).
Older/equal state revisions cannot overwrite newer state, but connection metadata
must always be processed. Do not add expectedRevision preconditions.

Maintain displayed-state revision separately from the last contiguous history
revision. A response at revision 20 does not prove history 13..19 has been loaded.
Deduplicate history by worldId/revision, fetch gaps through the contract cursor,
and preserve chronological inspection without automatically forcing scroll.

Subscribe before relying on a startup GET alone. Process stream.ready to obtain
the heartbeat subscription ID, then snapshots/updates. Renew presence every 5s;
server lease expires after 15s. On teardown/navigation, close the stream and stop
renewal; the server owns grace and auto-pause. Old IDs must not be renewed after
a replacement stream is ready. Multiple tabs are separate leases.

Reconnect receives current state, then catches up history. Do not replay missed
movements as if they are happening live. Reconnect after server restart/last-client
pause requires explicit Play. HTTP heartbeat's revision can expose a stale view
even if a final SSE update was lost. Do not automatically retry mutation requests
after timeouts; refresh authoritative state and report ambiguity.

Keep world identity in the URL so refresh restores the same world. Unknown or
cancelled world IDs show a clear not-found/create flow, not an invented reset.
Actual API persistence and stream errors should be visible without erasing input
drafts unnecessarily; indicate rejected commands were not applied.

## Motion and dense floors

Animate between adjacent committed tick snapshots for comprehension, never to
calculate movement. A blocked GOTO can rotate without translating. Charged/idle,
blocked/turned, and arrived states may coexist. Reconnect or skipped revisions
should resync with little/no travel animation, not fabricate intermediate paths.

Any animation duration must stay shorter than the selected tick interval; new
committed state wins over unfinished animation. Reduced-motion replaces movement
with immediate state changes or minimal fades. Avoid continuous flashing,
layout-shifting battery meters, full-grid glow, or history animations per idle row.

At 20 x 20, keep coordinates/IDs inspectable through scroll/zoom or selection,
without promising a pixel-perfect 400-robot desktop overview. Controls and queue
details remain usable; use bounded visual containers without imposing hidden
domain queue/history limits. Responsive layouts may stack inspector/history.

## UI tests and handoff evidence

Use Vitest + Testing Library. Test visible behavior and user events, not Svelte
internals or private CSS class names. Fake transport at its client boundary for
component tests; validate integration against real backend in the smoke path.

Cover placement/selection, correct coordinate mapping, scoped shortcuts and
on-screen equivalents, queue append/clear, lifecycle restrictions, persisted
state rendering, structured errors, duplicate/out-of-order updates, separate
history cursor, stream-ready ID replacement, heartbeat cleanup, and reconnect
without automatic resume. Verify mixed effects and reduced-motion rendering.

Provide screenshots/manual observations at default and dense floor sizes,
keyboard focus checks, and a real create->setup->step->play->pause->refresh flow.
Do not claim accessibility or end-to-end verification from unit tests alone.
Hand off actual commands/results, limitations, design deviations, and any new
questions without changing the agreed backend contract unilaterally.
