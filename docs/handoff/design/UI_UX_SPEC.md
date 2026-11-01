# Fleet Floor Simulator: UI/UX design handoff

Status: **approved by the user on 2026-11-01** (D063). This is not authorization
to start implementation (D048). Contrast is calculated, and accessibility and
performance remain unverified until tested in the built UI.

Visual companion: [workbench-design.html](workbench-design.html) holds the frames,
component-state gallery, palette preview, and timing demo.

## 1. Direction

Bright, plain workbench where the floor does the teaching: cool white ground, one
strong action color, square-celled floor, and a sentence stating what is allowed now.

### Approved choices

| Item | Choice |
| --- | --- |
| Palette | Palette A, Bright Daylight. Palette B was not selected. |
| Lifecycle track | A four-stop track with one sentence on what is allowed now, always in the header. |
| Robot marker | Home-plate silhouette plus inner arrow, so facing reads with color removed. |
| Column layout | Floor, then robot detail, then outcomes and history. Breakpoints at 760 and 1200 px. History has its own scrolling panel, at least 320 px tall. |
| Cell sizes | 54 to 72 px default floors, 30 px minimum at Fit, 44 px Large. |
| Type | System fonts only, with a 14 px body and 11 px minimum for coordinates. |
| Motion | Three speed tiers, using a 60% tick budget. All durations. |
| Speed control | Six preset chips plus a typed value labelled Next Play interval, plus a Running at readout while Playing. |
| Copy | All user-facing strings in the copy table, except the two D057 and D058 strings that are already approved. |

### Decisions, 2026-11-01

1. **Recovery after an automatic tick failure: Pause, then Play.** Agreed. The header keeps the committed Playing state, and the bar offers Pause and End with no Play. Once Pause commits, normal Play applies. If the database is still down, Pause reports an error and nothing changes.
2. **Tabs show the running interval.** Agreed, replacing my earlier recommendation. While Playing, the bar shows Running at 500 ms, separately from the tab's Next Play interval. Recorded as D061.
3. **A misplaced robot has no fix in this scope.** Agreed. No remove or re-placement flow is added. The hover cue and readout reduce misclicks, and Cancel still discards a whole draft.
4. **Arrow keys queue commands. C toggles the floor cursor.** Agreed. I chose this over mouse dragging, which you offered as an option. Dragging suggests a robot can be sent along a drawn path, but commands are relative to facing and run one per tick. Mouse users already have Forward, Left, and Right buttons, plus shift-click for GOTO.
5. **Grid lines stay below 3:1.** Accepted at 1.73 (A) and 1.70 (B). Axes, the readout, and a 3:1 hover and cursor outline carry location.
6. **Ended shows Create another world.** Agreed. It opens the existing creation flow and does not reset the ended world.

### Contract records

Recorded on 2026-11-01. D061 adds runningTickIntervalMs (integer, or null when no scheduler is running) to WorldResponse, world.snapshot, and world.updated, outside WorldSnapshot and not persisted. Clients treat scheduler.error as null. D062 names Pause as the recovery path, with no change to the action table. D063 approves this specification.

## 2. Domain rules versus visual choices

These come from the frozen contract and handoff. This design doesn't change them:

- Lifecycle actions and edit permissions per CONTRACT.md and FRONTEND.md.
- Up, Left, Right queue MOVE, LEFT, RIGHT. Forward is relative to facing.
- Append and Clear Queue only. In-bounds obstructed GOTO targets are accepted.
- Interval is per tab, 100 to 5000 whole ms, 1000 after refresh, set in Setting Up or Paused.
- Server snapshots own all simulation state. Nothing is predicted or animated before commit.
- Connection state is never a lifecycle. Auto-pause and restart require explicit Play.

Design constraints added on top, none of which change behavior:

- No GOTO route line, because the browser must not run pathfinding.
- Blocked edge direction comes from the robot's committed facing in the tick result.
- Came-from marks and motion only appear when revision and tick advance by exactly one.
- Keyboard cursor mode (decision 4) is input handling only.

## 3. Layout

Reading and tab order: world header, playback, tools, floor, selected robot, all
robots, last tick, history.

| Width | Grid | Behavior |
| --- | --- | --- |
| 1200 px and up | `minmax(0,1fr) 340px 300px` | Floor column; inspector over robot list; last tick over history |
| 760 to 1199 px | `minmax(0,1fr) 320px` | Floor plus inspector and last tick; robot list and history below |
| Under 760 px | One column | Sticky status, floor, last tick open, others collapsed, sticky command tray when a robot is selected |

Coordinate mapping: use `grid-column: x + 1; grid-row: height - y` so data order
never inverts. Keep axes on left and bottom. Label them `y north` and `x east`.

### Dense floors

Fit mode sizes cells to the space, from 30 to 72 px. Large mode uses 44 px and
scrolls inside the floor with axes pinned. Under 40 px markers show the number
only, in-cell coordinates hide, and the readout under the floor names the exact
cell and robot. History fills the rest of its column, at least 320 px tall, and
scrolls alone. Under 760 px, expanded history scrolls within 60% of the viewport.
Selecting a list row scrolls that robot into view. List and history
panels scroll on their own with a client-side ID filter. No domain limits are added.

## 4. Frames and component inventory

Rendered in the HTML companion: 1 Empty Setting Up; 2 Paused with selection,
features, and active GOTO; 3 Playing with success and block; 4a Reconnecting; 4b
Error banners; 5a Auto-paused; 5b Ended; three 390 px frames; dense 20 x 20.

| Component | Contents | Key states |
| --- | --- | --- |
| WorldHeader | Name, world ID, lifecycle track, tick, connection chip, allowed-now sentence | Each lifecycle; last known (dashed) |
| PlaybackControls | Play or Pause, Step, End, Finish Setup, Cancel, interval | Pending label after 150 ms; aria-disabled with reason |
| EditToolbar | Place robot, Obstacle, Charger | One selected; disabled with reason |
| FloorGrid | Cells, axes, robots, targets, outcome marks, readout | Empty, hover, cursor, pending, obstacle, charger, both, rejected, target |
| RobotMarker | Home-plate silhouette, inner arrow, upright ID | Unselected, selected, focus, on charger, zero battery, contested, no-path wait, GOTO complete, last known |
| RobotInspector | Position, facing, battery, queue, Clear, Forward, Left, Right, GOTO x/y, Pick on floor | Editable, read-only with reason |
| RobotList | Every robot's ID, facing, position, battery, full queue | Selected, hover, focus |
| QueueChip | Head filled, later outlined, GOTO with no-path count | Waiting, blocked, pending |
| BatteryMeter | Fixed-size meter and number, `empty` at 0 | Mid, zero, charging tag |
| LastTick | One sentence per robot effect | Empty, success, blocked, waiting, charging |
| HistoryPanel | Oldest to newest, expandable tick rows | Collapsed, expanded, new, gap, jump to latest pill |
| ConnectionStatus | Chip and banner | Connecting, live, reconnecting |

## 5. Tokens

Palette A, Bright Daylight, is selected. Palette B, Quiet Daylight, was not selected and stays for reference.

| Token | Palette A | Palette B | Purpose |
| --- | --- | --- | --- |
| --canvas | #F3F6FB | #F5F7F6 | Page ground |
| --surface | #FFFFFF | #FFFFFF | Panels and floor cells |
| --elevated | #FFFFFF | #FFFFFF | Menus and popovers, with shadow |
| --surface-sunk | #E9EEF6 | #EAEFED | Input wells, queue box |
| --text | #14213D | #1B2A2F | Primary text |
| --text-2 | #475569 | #4B5C60 | Secondary text |
| --border | #D5DDE9 | #D8E0DE | Panel dividers, decorative |
| --grid | #BAC6D6 | #BDC9C6 | Floor grid lines, accepted below 3:1 |
| --control-border | #71819A | #74858A | Input and button outlines |
| --focus | #0F62FE | #00639B | Keyboard focus ring |
| --selection | #7A1FC7 | #8A1C7C | Selected robot and row |
| --selection-tint | #F3E8FF | #FAEAF7 | Selected row fill |
| --primary | #0B57D0 | #00686F | Primary action |
| --primary-hover | #0842A0 | #004F55 | Primary hover and active |
| --on-primary | #FFFFFF | #FFFFFF | Text on primary |
| --robot | #1E3A6E | #22474F | Unselected robot body |
| --on-robot | #FFFFFF | #FFFFFF | Robot ID and arrow |
| --obstacle | #3A4557 | #414B50 | Obstacle fill |
| --obstacle-hatch | #667085 | #6B777C | Obstacle hatch lines |
| --charger | #FFD24A | #F4CF6A | Charger tile |
| --charger-ink | #5A3D00 | #594000 | Charger bolt and outline |
| --success | #0B7A45 | #2B7043 | Successful move |
| --success-tint | #E2F6EA | #E6F3EA | Success note fill |
| --blocked | #B44C00 | #A65300 | Blocked and waiting |
| --blocked-tint | #FFEEDD | #FBEFE0 | Blocked note fill |
| --danger | #C2183B | #B3261E | Error and destructive |
| --danger-tint | #FFE9ED | #FBE9E7 | Error banner fill |
| --disconnected | #596478 | #5F686C | Disconnected and last known |
| --disconnected-tint | #ECEEF3 | #EDEFEF | Disconnected banner fill |

```css
/* Approved, palette A (D063) */
:root {
  --canvas: #F3F6FB;
  --surface: #FFFFFF;
  --elevated: #FFFFFF;
  --surface-sunk: #E9EEF6;
  --text: #14213D;
  --text-2: #475569;
  --border: #D5DDE9;
  --grid: #BAC6D6;
  --control-border: #71819A;
  --focus: #0F62FE;
  --selection: #7A1FC7;
  --selection-tint: #F3E8FF;
  --primary: #0B57D0;
  --primary-hover: #0842A0;
  --on-primary: #FFFFFF;
  --robot: #1E3A6E;
  --on-robot: #FFFFFF;
  --obstacle: #3A4557;
  --obstacle-hatch: #667085;
  --charger: #FFD24A;
  --charger-ink: #5A3D00;
  --success: #0B7A45;
  --success-tint: #E2F6EA;
  --blocked: #B44C00;
  --blocked-tint: #FFEEDD;
  --danger: #C2183B;
  --danger-tint: #FFE9ED;
  --disconnected: #596478;
  --disconnected-tint: #ECEEF3;
  --font-ui: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-data: ui-monospace, "Cascadia Mono", Menlo, Consolas, monospace;
  --space-1: 2px; --space-2: 4px; --space-3: 8px; --space-4: 12px;
  --space-5: 16px; --space-6: 24px; --space-7: 32px;
  --radius-control: 4px; --radius-panel: 8px;
  --shadow-pop: 0 4px 16px rgb(20 33 61 / 14%);
  --cell-min: 30px; --cell-large: 44px; --cell-max: 72px;
  --motion-move: 240ms; --motion-turn: 160ms; --motion-edge: 160ms;
  --motion-fast: 120ms; --motion-instant: 80ms; --motion-budget: 0.6;
}
```

Type: title 20/26 weight 650; section 13/18 weight 650; body 14/20; small 12/16;
coordinates 11/12 in the data font; marker ID 13 px at 54 px cells, 10 px minimum.
Focus: 2 px `--focus` with a 2 px `--surface` offset. Floor cells have no radius.

## 6. Contrast evidence

Calculated with the WCAG 2.2 relative-luminance formula from the flat hex values
above. Overlays, antialiasing, and physical displays were not measured.

| Pairing | Use and target | A | B |
| --- | --- | --- | --- |
| --text on --canvas | Text, 4.5:1 | 14.75 | 13.76 |
| --text on --surface | Text, 4.5:1 | 15.97 | 14.80 |
| --text on --surface-sunk | Text, 4.5:1 | 13.71 | 12.73 |
| --text-2 on --surface | Text, 4.5:1 | 7.58 | 7.00 |
| --text-2 on --canvas | Text, 4.5:1 | 7.00 | 6.51 |
| --text-2 on --surface-sunk | Text, 4.5:1 | 6.50 | 6.02 |
| --on-primary on --primary | Text, 4.5:1 | 6.39 | 6.54 |
| --on-primary on --primary-hover | Text, 4.5:1 | 9.14 | 9.34 |
| --primary on --surface | Text, 4.5:1 | 6.39 | 6.54 |
| --on-robot on --robot | Text, 4.5:1 | 11.14 | 10.09 |
| --on-robot on --selection | Text, 4.5:1 | 7.37 | 8.27 |
| --selection on --selection-tint | Text, 4.5:1 | 6.25 | 7.16 |
| --charger-ink on --charger | Text, 4.5:1 | 6.93 | 6.48 |
| --success on --success-tint | Text, 4.5:1 | 4.79 | 5.25 |
| --success on --surface | Text, 4.5:1 | 5.41 | 6.00 |
| --blocked on --blocked-tint | Text, 4.5:1 | 4.66 | 4.80 |
| --blocked on --surface | Text, 4.5:1 | 5.28 | 5.44 |
| --danger on --danger-tint | Text, 4.5:1 | 5.20 | 5.58 |
| --danger on --surface | Text, 4.5:1 | 6.02 | 6.54 |
| --disconnected on --disconnected-tint | Text, 4.5:1 | 5.14 | 4.94 |
| --disconnected on --surface | Text, 4.5:1 | 5.97 | 5.70 |
| --control-border on --surface | Required indicator, 3:1 | 3.96 | 3.84 |
| --control-border on --canvas | Required indicator, 3:1 | 3.65 | 3.57 |
| --focus on --surface | Required indicator, 3:1 | 5.00 | 6.45 |
| --focus on --canvas | Required indicator, 3:1 | 4.62 | 5.99 |
| --selection on --surface | Required indicator, 3:1 | 7.37 | 8.27 |
| --robot on --surface | Required indicator, 3:1 | 11.14 | 10.09 |
| --robot on --charger | Required indicator, 3:1 | 7.73 | 6.71 |
| --obstacle on --surface | Required indicator, 3:1 | 9.68 | 8.95 |
| --charger on --obstacle | Required indicator, 3:1 | 6.72 | 5.96 |
| --charger on --surface | Not sufficient alone | 1.44 | 1.50 |
| --charger-ink on --surface | Required indicator, 3:1 | 9.99 | 9.73 |
| --selection on --robot | Not sufficient alone | 1.51 | 1.22 |
| --blocked on --surface | Required indicator, 3:1 | 5.28 | 5.44 |
| --success on --surface | Required indicator, 3:1 | 5.41 | 6.00 |
| --grid on --surface | Decorative | 1.73 | 1.70 |
| --selection on --charger | Required indicator, 3:1 | 5.12 | 5.51 |
| --focus on --charger | Required indicator, 3:1 | 3.47 | 4.29 |
| --surface on --obstacle | Text, 4.5:1 | 9.68 | 8.95 |
| --surface on --obstacle-hatch | Text, 4.5:1 | 4.97 | 4.61 |
| --charger-ink on --charger | Required indicator, 3:1 | 6.93 | 6.48 |

Consequences: charger tiles always carry a `--charger-ink` outline and bolt, because
yellow on white is too low alone. Selected markers put a white gap between body
and ring, because selection against robot body is too low alone. Grid lines are the
one accepted exception (decision 5).

## 7. Motion

Budget = 60% of the running interval reported by the server (D061). Step always uses the first column. New committed state
cancels unfinished motion. Reconnect and skipped revisions never travel.

| Trigger | Effect | 500 ms and up | 250 to 499 ms | 100 to 249 ms | Interrupted | Reduced motion |
| --- | --- | --- | --- | --- | --- | --- |
| One-cell committed move | Marker translates from prior cell. Dotted came-from mark stays until next tick. | 240 ms ease-out | 120 ms | Snap | New state jumps to final cell | Immediate placement, came-from mark still shown |
| LEFT or RIGHT, 90° | Silhouette rotates. ID stays upright. | 160 ms ease-in-out | 80 ms | Snap | Jumps to final angle | Immediate |
| GOTO turn and move, same tick | Turn first, then travel. 180° turns run clockwise. | 100 ms, then 180 ms | Both at once, 120 ms | Snap | Jumps to final state | Immediate |
| Blocked MOVE | Robot does not translate. Orange edge bar fades in on the side it faced, plus badge. | Bar 160 ms ease-out | Bar appears at once | Bar appears at once | Bar replaced by next state | Bar and badge at once |
| GOTO turn and blocked | Rotate, then edge bar on the new facing side. | 100 ms, then 160 ms | Rotate 80 ms, bar at once | Snap, bar at once | Jumps to final state | Immediate |
| Charging and idle charging | Number updates at once. Meter width eases. Fixed meter size, no layout shift. No change at cap. | 120 ms linear | None | None | Set to new value | Immediate |
| GOTO arrival | Flag leaves the cell. Check badge stays until next tick. One ring expands once. | Ring 240 ms | Badge only | Badge only | Ring removed | Badge only |
| UNREACHABLE | Chip leaves the queue. Badge and last-tick sentence stay until next tick. No shake. | Chip fade 120 ms | Instant | Instant | Instant | Instant |
| Selection, target, tool change | Ring or tool state appears. | 80 ms | 80 ms | 80 ms | Latest input wins | Instant |
| Queue append, after commit | Chip fades in at the end. Never before the server confirms. No ticks run while editing, so tiers don't apply. | 120 ms | 120 ms | 120 ms | Instant | Instant |
| Clear Queue, after commit | Chips fade out together. Robot does not move. | 80 ms | 80 ms | 80 ms | Instant | Instant |
| History entry arrival | Newest row tint fades once. Scroll position is untouched. Rows batch if ticks arrive quickly. | 400 ms tint | None | None | Tint dropped | No tint |
| Play, Pause, End pending | Label changes after 150 ms if still waiting. No spinner loop. Lifecycle track moves only on commit. | Delay 150 ms, swap 80 ms | Same | Same | Commit replaces label | Delay kept, swap instant |
| Connection change | Chip and banner swap. No pulse. Last-update text steps every 5 s. | 120 ms fade | Same | Same | Latest status wins | Instant |
| Reconnect or skipped revision | No travel. Current state replaces view. Came-from marks and outcome motion are skipped. | None | None | None | Not applicable | Same |

## 8. Messages

| Situation | Source | Copy |
| --- | --- | --- |
| Robot on occupied or obstacle cell | INVALID_PLACEMENT | Can't place a robot at (3,4): that cell has an obstacle. Choose another cell. |
| Obstacle on a robot | INVALID_PLACEMENT | Can't add an obstacle at (4,3): R2 is standing there. |
| Edit while Playing | Local hint | Pause to edit the floor or queues. |
| Edit after a stale tab acts | INVALID_LIFECYCLE | This world is now Playing, so the change wasn't applied. Pause to edit. |
| Ended | Local hint | This world has ended and is read-only. |
| Resize would clip content | INVALID_PLACEMENT | Can't resize to 6 × 6: R3 at (7,2) would be off the floor. The size stays 10 × 8. |
| GOTO out of bounds | Local, then server | Target must be on the floor: x 0 to 9, y 0 to 7. |
| Interval invalid | Local, then server | Enter a whole number from 100 to 5000 ms. |
| Persistence failure | PERSISTENCE_UNAVAILABLE | That change was not saved. The database is unavailable, so the floor is unchanged. Try again in a moment. |
| Unclear outcome after timeout | Client state | We couldn't confirm that change. The latest saved state is shown. Check it before trying again. |
| Connecting | Transport | Connecting to the simulator… |
| Reconnecting | Transport | Reconnecting. Showing the last state received at tick 15. |
| Explicit resume | No-clients history entry | Playback paused while no tabs were connected. Nothing ran after tick 15. Press Play to resume. |
| Server restart | Restart history entry | The server restarted and paused this world at tick 15. Press Play to resume. |
| Automatic tick failure | scheduler.error, D058 text | Playback stopped due to an error. |
| Recovery after tick failure | D062, follows D058 text | Press Pause, then Play to continue. |
| Pause fails during recovery | PERSISTENCE_UNAVAILABLE | Couldn't pause yet because the database is unavailable. Nothing changed. Try Pause again in a moment. |
| Draft gone | 404 on GET, D057 text | This draft is no longer available. |
| Unsupported saved format | UNSUPPORTED_SNAPSHOT_VERSION | This world was saved in a format this version can't read. Its saved data was not changed. |
| Unknown world | WORLD_NOT_FOUND | We can't find that world. Create a new one to continue. |

### Tick outcomes

| Outcome | Copy |
| --- | --- |
| Moved | R1 moved north to (1,2). |
| NO_BATTERY | R4 has no battery. Robot stayed at (6,6). |
| OUT_OF_BOUNDS | R2 reached the floor edge. Robot stayed at (9,3). |
| OBSTACLE | R2 hit the obstacle at (3,3). Robot stayed at (2,3). |
| CONTESTED | R5 was blocked: R2 has the lower ID and also aimed for (5,3). |
| HEAD_ON_SWAP | R1 and R2 can't swap cells head-on. Both stayed. |
| OCCUPIED | R3 was blocked: R2 stayed in (4,4). |
| Turned | R2 turned to face East. |
| GOTO turned and blocked | R5 turned west, then was blocked: (reason sentence). |
| GOTO no path | R2 found no path to (8,6), try 2 of 3. Facing unchanged. |
| GOTO UNREACHABLE | R2 gave up on GOTO (8,6): no path for 3 ticks in a row. Marked UNREACHABLE. |
| GOTO arrived | R2 arrived at (8,6). GOTO complete. |
| Charged | R3 ended the tick on a charger: battery 30 to 40. |
| Charged at cap | R3 ended the tick on a charger: battery 94 to 100, capped. |

## 9. Accessibility

- Floor: `role="grid"`, roving tabindex, north row first in DOM, cell names combining
  coordinates and contents, such as "x 4, y 3, charger, R2 facing East, battery 64, selected".
- Polite live region: lifecycle, connection, action results, selected robot's outcome.
  Assertive only for errors that stop playback. Summarize at most every 5 s while
  Playing. Never announce idle robots per tick.
- Disabled controls: `aria-disabled`, focusable, reason through `aria-describedby`.
- Shortcuts apply inside the simulator area only, never in inputs, and ignore `event.repeat`.
- Selected robot: arrows queue. `C` toggles floor cursor: arrows move, Enter clicks,
  Shift+Enter issues GOTO, Esc exits. Without a selected robot, arrows move the cursor.

## 10. Acceptance checks

1. Empty cell at x=2, y=1 on a 10 × 8 floor renders in the second row from the bottom, third column.
2. With colors removed, facing, selection, obstacle, charger, blocked, and last-known states are all still distinguishable.
3. Pressing Up with R2 facing East queues MOVE and the on-screen button says Forward, not North.
4. No robot position, queue, battery, or lifecycle value changes before a successful response or SSE update.
5. No route line is drawn for GOTO, and the browser runs no pathfinding.
6. Playing shows Pause and End enabled. Edit controls stay focusable and state why they are disabled.
7. Reconnecting never shows Paused unless a Paused state was committed and received.
8. After auto-pause, reconnecting does not start ticks. The banner asks for Play.
9. While Playing, the bar shows the server-reported running interval, even after a refresh resets Next Play to 1000.
10. After scheduler.error, the header stays Playing, no Play button shows, and Pause then Play resumes ticks.
11. Interval input rejects 99, 5001, and 250.5, and accepts 100 and 5000. Refresh returns it to 1000.
12. Every animation finishes in less than the running tick interval. At 100 to 249 ms nothing travels.
13. With prefers-reduced-motion, no robot travels or rotates over time.
14. Scrolling up in history is preserved while ticks arrive. A jump control appears instead.
15. History scrolls in its own panel, at least 320 px tall, with long histories never pushing the floor out of view.
16. A 20 × 20 floor keeps a 30 px minimum target, pinned axes, and a readout naming the exact cell.
17. Arrow keys typed in width, height, GOTO, or interval fields do not queue commands. Held keys do not repeat.
18. A screen reader hears lifecycle, connection, rejected action, and selected-robot events, not one message per idle robot.

## 11. Artifacts and limits

Produced: this file and `workbench-design.html`. No Figma file, exported image, or
Svelte code exists. Contrast is calculated, not measured on real screens. No assistive
technology, performance, or usability test was run. Example data in the frames was
written by hand, not produced by the engine.
