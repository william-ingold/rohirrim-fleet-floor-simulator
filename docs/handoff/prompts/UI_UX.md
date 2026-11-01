# UI/UX design prompt for an AI design tool

Copy the prompt below into the design tool. Attach HANDOFF.md, FRONTEND.md,
CONTRACT.md, and relevant DECISIONS.md sections if the tool cannot read the repo.
This is a design assignment, not authorization to implement or publish a website.

---

Design **Fleet Floor Simulator**, an interactive warehouse-robot simulation
workbench. The user selected a **bright, approachable, clear, educational** visual
direction. Your output will guide coding agents building Svelte + Vite with
plain/component CSS. Produce a concrete design specification and visual artifacts
where your tool supports them; don't stop at mood adjectives or generic advice.

Do not change simulator rules to improve the composition. Clearly label all new
palette values, spacing, motion timings, and decorative treatments as design
proposals awaiting review. Do not invent a brand, customer metrics, live telemetry,
robot capabilities, or already-verified accessibility/performance results.

## Purpose and hierarchy

The user should immediately understand:

1. Which world lifecycle is active and what actions are currently permitted.
2. Where robots are, which way they face, and which one is selected.
3. Commands are queued, then all robots act on the next tick.
4. What happened last tick, including why movement failed.
5. Battery, chargers, pending commands, and history without leaving the workbench.

Make the floor the primary visual area. Prefer a light neutral canvas, crisp
typography, deliberate whitespace, and distinguishable status colors. Use friendly
clarity rather than toy-like controls. Include a short command/tick explanation
where useful; no multi-page onboarding flow is needed.

## Mandatory behavior and content

- Default floor 10 x 8, maximum 20 x 20. Southwest origin (0,0) is bottom-left;
  x grows east/right and y north/up. Include axes or a clearly legible orientation.
- Robots have ID, cardinal facing, position, battery, and ordered command queue.
  Show ID plus an unmistakable direction arrow; color alone cannot identify them.
- Clicking an empty cell outside feature edit mode places a NORTH-facing robot.
  Clicking a robot selects it. Respect overlapping charger/obstacle representation.
- Selected robot: Up queues MOVE, Left queues LEFT, Right queues RIGHT. MOVE is
  forward relative to facing. Provide on-screen equivalents and visible shortcut
  hints; never imply Up always moves north.
- GOTO target via shift-click plus a touch/keyboard-accessible target control.
  In-bounds obstructed targets are accepted and may become UNREACHABLE after
  three no-path ticks. Show active GOTO target and waiting progress accurately.
- Show queues/battery for every robot with an inspectable list/scroll area; don't
  pretend only the selected robot has a queue. Selected inspector adds detail.
- Queue operations are append and Clear Queue, not drag reorder or per-item removal.
- Provide mutually exclusive placement/obstacle/charger tool states. An obstacle
  cannot be placed on a robot. Feature clicks send explicit desired enabled state.
- Setup: dimensions, initial content/queues, Finish Setup, Cancel. Finish Setup
  captures t0 and enters Paused; Cancel discards unfinished setup.
- Paused: edits, queue changes, Play, one-tick Step, End; dimensions locked.
- Playing: inspection, Pause, End; editing disabled with an understandable reason.
- Ended: final floor/queues/history inspectable and read-only, no reset/resume.
- Playback speed follows D051/D052: per-tab selection, initially 1000ms and reset
  on refresh, whole milliseconds from 100 through 5000 inclusive, selectable in
  Setting Up/Paused and passed on PLAY. Propose the control's visual design
  within those rules; repeated PLAY keeps the running interval (D055).
- History shows committed placements, feature edits, queue changes, lifecycle,
  and tick results. Tick entries may expand to robot outcomes. No timeline/fork
  scrubber is committed. Preserve chronological reading and user scroll position.
- Server is authoritative. Show pending actions and real errors, not an animated
  successful move before commit. Connection state is separate from world lifecycle.
- HTTP actions + SSE snapshots. Show connecting/reconnecting/last-known-state
  status clearly. Browser heartbeats every 5s; if all clients expire after 15s,
  server pauses. Reconnection after that requires explicit Play.
- Do not add login, multi-floor dashboard, draft archive, leaderboard, analytics,
  3D view, robot repair, reverse commands, or other unapproved product flows.

## Deliverable 1: layout and interaction wireframes

Produce desktop and narrow-screen wireframes with component labels. Include:
world header (name/ID if displayed, lifecycle/tick/connection), playback controls,
floor/tool area, robot list/inspector, and history. Explain reading order and
what stacks/collapses on smaller screens. Give dense 20 x 20 inspection behavior
without shrinking every cell into an unreadable target or adding robot limits.

Include representative frames for:

1. Empty Setting Up world with dimensions and concise instructions.
2. Paused world with selected robot, charger/obstacle features, active GOTO queue.
3. Playing world with an example of successful movement and blocked movement.
4. Error/reconnecting state showing last-known data without pretending it is live.
5. Auto-paused-after-disconnection and final Ended read-only state.

If your tool only outputs text, provide unambiguous layout grids and component
specifications instead of claiming mockups were rendered.

## Deliverable 2: visual tokens and component states

Propose one recommended light palette and one restrained alternative within the
same bright-workbench direction. Show actual HEX values, purpose, pairings,
and representative swatches if supported. Explain the choice briefly.

Required semantic roles: canvas, surface, elevated surface, text primary/secondary,
border/grid, focus, selection, primary action, obstacle, charger, successful move,
blocked/waiting, danger/error, disconnected. Distinguish transient outcomes from
persistent floor features; obstacle and charger must remain understandable together.

Provide typography families/fallbacks, sizes/weights/line heights; spacing scale;
cell sizing/coordinate text; border radius; restrained shadows; and focus-ring
treatment. Prefer a system-font option and CSS-native icons/shapes/simple vectors
over new font/image dependencies. Decorative artwork is not required.

List hover/focus/active/selected/disabled/pending/error states for buttons, tools,
cells, robot markers, queue chips, battery meters, and history rows. Include
unselected/selected robot, zero battery, charger occupancy, no-path wait, contested
block, and completed GOTO. Provide concise user-facing copy for rejected placement,
paused-only editing, persistence failure, reconnecting, and explicit resume.

Compute/report contrast for proposed pairings rather than asserting compliance.
Target WCAG AA: ordinary text at least 4.5:1, large text 3:1, and required visual
control/state indicators 3:1 against adjacent colors. Use labels/shapes/icons in
addition to color. Include keyboard focus and screen-reader status strategy;
avoid announcing every idle robot on every tick.

## Deliverable 3: motion/effects specification

Create a table with trigger, visual effect, proposed duration/easing, cancellation
or interruption behavior, and reduced-motion alternative. Motion is informative
and subordinate to committed server state. Cover:

- One-cell committed robot movement and 90-degree rotation.
- Blocked MOVE: restrained feedback without translating the robot into the cell.
- GOTO rotation plus blocked movement in the same tick.
- Charging/battery change and idle charging, including cap at 100.
- GOTO arrival and UNREACHABLE feedback.
- Selection/target/tool changes, queue append/Clear, history entry arrival.
- Play/Pause/pending transition and connection/reconnect states.

New state interrupts unfinished animation. Durations must fit within the chosen
tick interval; specify how faster playback reduces/omits motion. For reconnect
or skipped revisions, show current state without inventing intermediate paths.
Reduced motion uses immediate placement or minimal fades. Avoid flashing,
continuous glow/pulses, parallax, or animation on hundreds of idle robot rows.
Proposed durations are design recommendations, not user-approved timing rules.

## Deliverable 4: coding-agent handoff

Return:

1. Reviewed-direction summary and a list of proposed choices needing user review.
2. Wireframes/mockups and a state/component inventory.
3. Token table suitable for CSS custom properties.
4. Motion/state specification and reduced-motion alternatives.
5. Accessibility and dense-floor interaction notes with actual contrast evidence.
6. Responsive layout rules, examples of messages, and acceptance checks.
7. Exact artifacts you produced and limitations; no fabricated exports or screenshots.

Keep business rules and transport constraints separate from visual suggestions.
If a visual request conflicts with the domain, surface it as a question rather
than adding a new behavior. Deliverables should be implementable in ordinary
Svelte components and CSS within a five-hour application planning target.

Accessibility references for verifying proposals:

- https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
- https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
- https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html
