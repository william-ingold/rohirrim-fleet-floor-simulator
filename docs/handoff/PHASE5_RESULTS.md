# Phase 5 implementation results

User authorized all phase 5 on 2026-11-01, with focused commits. Implemented the
local Svelte/Vite/strict TypeScript frontend under apps/web. Backend engine,
scheduler, storage, routes and frozen contract remain unchanged. Existing user
planning/design edits were preserved. No agents, publication, or deployment.

## Delivered behavior and acceptance

| IDs | Implementation and evidence |
| --- | --- |
| U01 | Default 10 × 8 creation; north-first DOM with southwest coordinates, axes, readout and cardinal home-plate markers. Component test checks x2/y1 maps to row7/column3. Real browser creates and places at those coordinates. |
| U02 | Server-assigned placement, robot selection, exclusive obstacle/charger tools and desired-value actions. Scoped Up/Left/Right and on-screen equivalents; C cursor, Enter and Shift+Enter. Repeated keys and input typing do not queue. Component tests and real keyboard focus check. |
| U03 | Inspector and every robot row show complete pending order and battery; append, Clear, GOTO x/y and floor target controls. In-bounds obstacle targets are accepted by the client. Existing progress remains committed server data. Component tests plus real queue/Step movement. |
| U04; UI L01–L05 | Setup/Paused/Playing/Ended guards, setup-only preserve/reject resize, Finish Setup, Cancel, End and Create another world. One mutation in flight; no optimistic snapshots; pending/rejected cells, structured errors, uncertain-outcome refresh without mutation retry. Ended queues remain inspectable. Real browser lifecycle/refresh/cross-tab cancellation and component restrictions. Baseline immutability remains backend-owned and covered by existing backend tests. |
| U05; browser S08 | One snapshot reducer rejects older revisions, merges duplicate history independently, and tracks contiguous history separately. Fixed upper history boundary across pages, gap retries and heartbeat revision reconciliation. Session tests exercise out-of-order responses, missing history and missed final state. Real browser history remains scrollable during ticks. |
| U06; browser S04/S06/S07 | Stream ready IDs create/replace five-second renewal timers. Loss closes the old source, stops renewal, GET-checks deletion, then reconnects. Teardown and pagehide close stream/timers; stale asynchronous callbacks are ignored. No automatic Play or client simulation loop. Session tests and real heartbeat/15-second expiry/refresh/second-tab cancellation checks. |
| U07 | Approved tokens, visible focus, labelled controls/grid/inputs, roving cells, color-independent facing/features/selection, disabled reasons, bounded lists, system reduced motion and responsive collapsible panels. Real 20 × 20/60-robot and 390px checks verify minimum cell size and no page-wide horizontal overflow. Screenshots inspected; no screen-reader or full accessibility-conformance claim. |
| U08 | Next Play presets/custom whole-ms validation (100..5000), refresh default 1000, separate server Running at readout, Pause/End after scheduler.error, independent history panel with jump control and no forced scrolling. Component and real-browser SQL-triggered scheduler-recovery/scroll checks. |

State ownership is explicit: only selection, tools, drafts, interval, view panels
and committed-state presentation live in the browser. All domain imports are
`import type`; the browser does not execute engine rules/pathfinding. Local
presentation compares committed positions/facing/battery and never predicts
successful actions or ticks.

## Implementation and operational seams

- `src/lib/client.ts`: typed fetch/EventSource adapter, ten-second request timeout,
  stable API errors, manual stream replacement and explicit close.
- `src/lib/session.ts`: observable session, world/revision ordering, one mutation,
  contiguous history map/catch-up, lease identity, resync and generation guards.
- `src/lib/types.ts`: local transport envelope, type-only backend action/history
  and public domain snapshot definitions. No additional shared workspace package.
- `App.svelte`: creation, URL identity, history navigation, missing-world flow,
  page lifecycle cleanup/restoration.
- Components: Workbench, Floor, Marker, Queue, Battery and History. App CSS holds
  the approved Bright Daylight token block and 760/1200px responsive rules.
- Motion follows adjacent committed ticks only, with tiered travel/turn/edge and
  arrival effects; reduced motion snaps. Missed revisions/reconnects discard
  travel marks. Non-tick actions preserve last tick context. No GOTO route line.
- `playwright.config.ts` and `e2e/`: production asset preview, real Nest API with
  temporary SQLite, controlled SQL-trigger failure and browser screenshots. The
  test launcher uses ports 3000/5173 and retains its database under `/tmp` when
  supplied through the test configuration. It does not touch a developer DB.

Use Node 26.13.0 and one root lockfile. Official npm metadata verified exact pins:
Svelte 5.57.3, Svelte Vite plugin 7.3.1 (compatible with retained Vite 8.3.5),
svelte-check 4.7.7, Testing Library Svelte 5.4.2, jsdom 30.1.3, user-event 14.6.8,
Playwright 1.64.1. Installation required escalation after sandbox DNS failure.
It reported 20 audit findings (4 low, 16 moderate). No forced remediation,
independent final audit, clean reinstall or zero-vulnerability claim.

## Actual validation

All commands used Node 26.13.0 from `/tmp/node-v26.13.0-linux-x64/bin` on PATH.

| Command/check | Actual result |
| --- | --- |
| Frontend session tests with subscription startup disabled | 4 failed; restoring drafted implementation made all 4 pass. The implementation was drafted before that red run while dependencies were unavailable; not strict test-first evidence. |
| Initial workbench suite | Missing-component import failure, then matchMedia test-shim failures and an actual GOTO-y accessible-label spacing failure; fixed, 9 tests passed. |
| Expanded component/session/presentation checks | 20 passed. Additional audits mostly passed on introduction; no red claim for them. |
| Initial strict Svelte check | Found `$state`/local `state` naming collision; renamed. Later test typing mistakes and a conditional DOM-ref warning were corrected. |
| Initial Chromium suite | 2 passed/2 failed: exact queue text locator and five-second cancellation timeout. Fixed command-name markup and used a ten-second deletion assertion. |
| Revised Chromium suite | 4 passed, then 5 passed after 60-robot/history/heartbeat additions. |
| SQLite-trigger scheduler browser check | Six-case suite passed, including stopped Playing and Pause/Play recovery. |
| Full root regression before final tick-context audit | Build passed; 108 engine/CLI + 69 API + 19 frontend tests passed (196). Strict typecheck and diff check passed. |

Final post-audit checks:

| Command | Result |
| --- | --- |
| `npm test` (escalated after sandbox CLI EPERM) | All four workspace builds passed; 108 engine/CLI + 69 API + 20 frontend = **197 passed**. |
| `npm run typecheck` | Passed; **zero Svelte errors and warnings**. |
| `git diff --check` | Passed. |
| `PLAYWRIGHT_BROWSERS_PATH=/tmp/rohirrim-playwright npm run test:browser --workspace @rohirrim/web` | **7 passed** against the final production bundle; includes selected-cell visibility after viewport resize and no transform animations for a real reduced-motion move. |
| `npm run scenario -- scenarios/goto-charger.txt` | Built engine/CLI, then printed the six expected lines: R1 2,1,EAST; 97; R1 2,0,SOUTH; 100; R1 2,0,EAST; 100 (each battery line includes R1). |

Chromium was downloaded under `/tmp/rohirrim-playwright`.
The sandbox denied the first API listener (EPERM); browser checks used elevated
execution. Existing Jest VM Modules/localStorage and Playwright color-environment
warnings remain. No fabricated clean install, timing, coverage or manual results.

## Visual review and limits

Retained captures:

- [Default setup desktop](phase5/screenshots/01-setup-desktop.png)
- [Paused desktop](phase5/screenshots/02-paused-desktop.png)
- [Dense desktop, 60 robots](phase5/screenshots/03-dense-desktop.png)
- [Dense 390px viewport](phase5/screenshots/04-dense-mobile.png)
- [Real scheduler failure](phase5/screenshots/05-scheduler-error.png)
- [Default paused 390px viewport](phase5/screenshots/06-default-mobile.png)


Screenshots are real Chromium captures of committed API state, not fixtures or
design-frame data. The desktop review caught a selected-row foreground contrast
mistake, which was corrected. Dense mobile review caught selection moving out of
view after resize in Large mode; the reveal effect now also observes viewport
width, and the final browser assertion and capture show the selected R20 in view. The dense and mobile captures were reviewed for
cell/axis/readout visibility, scrolling boundaries and collapsed panels. Automated
focus checks exercised C-cursor navigation; reduced-motion is covered by emulated
system preference and presentation guards, and a real committed-move check verifying that reduced motion creates no transform animations. No full motion/performance audit was performed.

No known failing checks remain at this report's finalization. Required phase 5
flows are implemented. Remaining validation limits: Firefox/WebKit, real touch
hardware, assistive technology, formal accessibility audit, performance/400-robot
load, network saturation and full physical persistence-failure testing. These are
not claimed from unit tests or screenshots. No contract changes or unresolved
material behavior questions were introduced.

Next is phase 6: final independent end-to-end/review and documentation gate.
Read this report, README, CONTRACT/ACCEPTANCE, B5/B4/B3 reports, approved design,
frontend tests/e2e flows and AI_USAGE.md. Phase 5 includes its own integration
smoke; it does not claim the separate overall phase 6 review has been performed.
