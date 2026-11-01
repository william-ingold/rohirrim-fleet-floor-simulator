# Phase 6 review and testing results

Reviewed 2026-11-01 against the supplied brief, confirmed decisions, frozen
contract, acceptance matrix, Phase 5 handoff, B3/B4/B5 results and approved design.
User authorized review/testing with focused commits and explicitly requested all
original `test-scenarios/*` files. Existing user planning/design edits were
preserved. No agents, dependency upgrades, publishing or deployment.

## Findings, ranked by impact

Both confirmed findings were corrected. No unresolved confirmed defect remains
from this review; this is not a claim that all possible defects are excluded.

| Priority | Trigger and observed defect | Fix and regression evidence |
| --- | --- | --- |
| P2 | A tab receives scheduler.error, disconnects, misses another tab's Pause/Play, then receives a newer Playing snapshot with an active interval. `Session.apply` retained stopped=true, displaying a false error alongside running playback. | [session.ts](../../apps/web/src/lib/session.ts) clears the stale flag when a newer committed view reports active scheduling. Same-revision replies retain error protection. New session test actually failed before the fix, then passed. Real two-tab browser failure/disconnection/recovery also passed. |
| P2 | With a robot selected outside cursor mode, repeated or Alt/Ctrl/Meta Shift+Enter on a floor cell bypassed keyboard guards and appended unwanted GOTOs. | [Floor.svelte](../../apps/web/src/components/Floor.svelte) now applies the existing shortcut guards at cell activation. New component test actually observed four unwanted actions, then passed after the fix; ordinary Shift+Enter still sends one GOTO. |

Focused commits: `524b468` scheduler recovery, `a515cca` keyboard guards,
`28d04cf` original CLI fixtures, and `ed698b8` browser review/isolation.
D066 records the implementation choices without changing approved domain rules.

## Brief command coverage

The CLI implements FLOOR, OBSTACLE, PLACE (including existing-ID relocation),
QUEUE with MOVE/LEFT/RIGHT/GOTO, TICK with optional count, REPORT, CHARGER and
REPORT BATTERY. It shares the API's engine. Invalid lines are atomic/recoverable;
reports are numeric-ID ordered and EOF does not drain queues.

The UI calls TICK **Step**, as the brief requests, and shows report information
in the floor/inspector/robot list. It does not have a command prompt, REPORT text
export, exact-N Step control, explicit-ID placement or direct existing-robot
relocation. UI dimensions preserve/reject contents rather than replacing drafts.
These distinctions are documented in the [README command mapping](../../README.md#cli-commands-and-ui-equivalents).
No new UI command features were inferred from the user's coverage question.
Selected modules A/B are implemented; timeline/fork C remains omitted and full
module D completion is not claimed.

Original supplied files were passed unchanged by absolute path to the real
compiled CLI, including their non-directive expected-output text. Expected stdout
was independently transcribed from the supplied examples, not calculated with
production helpers. A directory-inventory check prevents silent file omissions.

| Original file | Behavior | Exact stdout, empty stderr and exit 0 |
| --- | --- | --- |
| scenario-1.txt | Following chain | Passed, three robot lines |
| scenario-2.txt | Blocked head-on swap | Passed, two robot lines |
| scenario-3.txt | Contention and blocked follower | Passed, three robot lines |
| scenario-4.txt | Four-robot rotation | Passed, four robot lines |
| scenario-5.txt | Different queue lengths, TICK 3 then TICK 10 | Passed, both REPORT sections/four lines |

These five files have no battery contradiction. The separate brief battery
example remains the approved D010 exception: on width 3, only two eastward moves
succeed, so battery is 98 rather than the printed 97. Existing battery/GOTO and
custom scenario fixtures remain covered.

## Cross-layer review evidence

Reviewed simultaneous intent resolution, numeric contention/no reconsideration,
dependency blocking/cycles, BFS tie order and starting occupancy, command progress,
battery/charging, immutable snapshots/queues, parser/reporter/EOF behavior,
transaction/recovery/publication boundaries, loop/lease generations, bounded
stream delivery and browser revision/history ownership. Existing behavioral
tests were inspected as well as executed; test names alone were not treated as
proof. API GOTO and initial-stream JSON fixtures match the server checks; the
frontend session tests also use the GOTO fixture. Frontend domain imports are
type-only; there is no client tick/pathfinding implementation.

[review.spec.ts](../../apps/web/e2e/review.spec.ts) adds an actual browser flow:
place R1, face East, queue MOVE, Finish Setup, then Step. A real SQLite trigger
aborts history insertion after the snapshot update. HTTP returns 500, the UI
retains position/battery/queue, SQLite retains snapshot/revision/t0/history, and
the browser's actual EventSource receives no world.updated for the failed action.
Removing the trigger and stepping produces identical committed HTTP/SSE data,
position (1,0), battery 99, empty queue, one history entry and unchanged t0.
This test passed on introduction; it is not claimed as a new red run.

A second browser check induces a real scheduler failure, closes one tab's stream
and blocks its reconnection, resumes through another tab, then reconnects and
asserts live playback without the stale warning. Browser instrumentation observes
the native EventSource; it does not replace the backend or fabricate responses.

Retained real HTTP/deterministic-clock checks prove subscribe/read races,
post-commit ordering/rollback, lease expiry/grace and renewal identity, stale
callback rejection, last-client persisted Pause and explicit restart recovery.
The Chromium suite separately exercises actual 15-second lease expiry, refresh,
second-tab cancellation, five-second presence requests, scrolling history,
setup facing/deletion, keyboard focus, 20 × 20/60 robots, 390px layout and reduced
motion. Tick atomicity comes from synchronous transaction/command execution and
the existing interleaving tests, not a timing benchmark.

## Commands actually run

All checks used Linux Node 26.13.0, with `/tmp/node-v26.13.0-linux-x64/bin` on PATH.
Socket/process suites used escalation. No running development/Docker service was
stopped or redeployed.

| Check | Result |
| --- | --- |
| Baseline `npm test` | Four builds; 110 engine/CLI + 72 API + 26 frontend = 208 passed |
| New scheduler session regression | 1 failed/26 passed, then 27 passed after correction |
| New cell keyboard regression | 1 failed/27 passed, then 28 passed after correction |
| Focused CLI process suite | 21 passed, including every original file and mandatory root invocation |
| Final `npm test` | Four builds; 116 engine/CLI + 72 API + 28 frontend = **216 passed** |
| Final `npm run typecheck` | Passed; zero Svelte errors/warnings, including browser tests/config |
| `git diff --check` | Passed |
| `npm run scenario -- scenarios/goto-charger.txt` | Built engine/CLI and printed the six expected lines: R1 2,1,EAST; R1 97; R1 2,0,SOUTH; R1 100; R1 2,0,EAST; R1 100 |
| Production Chromium suite | **10 passed** in 36.2 seconds |
| Clean temporary copy: `npm ci --offline --cache /tmp/rohirrim-npm-cache` | Installed 621 packages from the existing cache, retaining the root lockfile |
| Clean copy: `npm test`, then strict typecheck | Same 216 tests passed; zero Svelte errors/warnings after copying the review test's typing correction |

Browser command (after Chromium installation):

```sh
FLEET_TEST_API_PORT=3101 FLEET_TEST_WEB_PORT=5273 \
FLEET_TEST_SCREENSHOTS=/tmp/rohirrim-phase6-screenshots \
PLAYWRIGHT_BROWSERS_PATH=/tmp/rohirrim-playwright npm run test:browser
```

Default browser ports remain 3000/5173. Tests refuse existing servers and use a
temporary SQLite database. Phase 5 captures were preserved; this run generated
six new scratch captures. Dense desktop and default mobile captures were actually
viewed for controls, facing/selection, axes, scroll boundaries and layout. No
additional visual defect was confirmed in that inspection.

New browser-test code initially had 16 TypeScript diagnostics for instrumentation
and SQLite row types; corrected before the final strict check. An initial README
patch failed its context match without editing files and was corrected. Neither
is claimed as a product defect. Clean install emitted dependency deprecation and
unapproved optional build-script warnings; native SQLite tests nevertheless
passed with packaged binaries. Offline npm reported zero findings, but no fresh
online vulnerability audit or remediation was performed. Jest experimental and
Playwright color-environment warnings remain.

## Completion and limits

The authorized Phase 6 end-to-end/documentation gate is complete. README and
RUNNING explain commands, module scope and isolated review operation. Decisions
and AI usage record corrections, rationale and actual evidence. Architecture and
handoff now distinguish current implementation from original planning history.
Existing user planning/design changes remain outside these commits.

Not validated here: Firefox/WebKit, assistive technology/formal accessibility
conformance, physical touch hardware, 400-robot/performance/load or network
saturation, physical power-loss behavior, a fresh online registry install/audit,
or a rebuilt Docker runtime. Prior Docker evidence remains historical. No elapsed
project-time, coverage percentage, complete module D, or zero-vulnerability claim.
