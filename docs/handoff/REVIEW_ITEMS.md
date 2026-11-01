# Review items before dependent implementation

R1–R5 are resolved: R1 in D050, R2 in D051/D052, R3 in D053, R4 in D054,
and R5 in D055–D060. CONTRACT.md is approved and frozen for the documented
boundary, as amended after design review by D061/D062. The table retains the questions and agreed resolutions for reference.
New material behavior changes require discussion and agreement before records
are updated. This review does not authorize application implementation.

| ID | Question | Recommendation and reason | Affects |
| --- | --- | --- | --- |
| R1 — resolved | What does CANCEL return after deleting a draft? | Approved HTTP 200 receipt `{worldId, cancelled: true}` after commit (D050). Return to creation only after commit; subsequent GET is 404. Explicit exception to the ordinary state envelope, without a retained Cancelled state. D057 resolves associated stream shutdown and other-tab recovery. | API, client navigation, cancellation tests |
| R2 — resolved | Where is adjustable playback speed held, and what is the initial value/range? | Approved D051/D052: per-tab local selection, initially 1000ms and reset to that on refresh; selectable during Setting Up/Paused and passed as `tickIntervalMs` on PLAY. Server scheduler owns the running interval outside durable simulation state. UI and API enforce whole-number milliseconds from 100 through 5000 inclusive. | PLAY DTO, scheduler, controls |
| R3 — resolved | Is the supported deployment one Nest process? | Approved D053: one running Nest API process owns per-world serialization, scheduling, streams, and presence. Multiple browser clients remain supported. User explicitly excluded scaling and high availability; no API replicas or distributed coordination. Existing durability/restart recovery remains required. | Startup recovery, transactions, streams |
| R4 — resolved | Should unsupported snapshot versions migrate automatically? | Approved D054: reject unsupported versions with a clear error and leave saved data untouched. No world-format changes are planned. SQL migrations remain versioned; JSON upgrades require explicit migrations if introduced later. D059 specifies HTTP 500 / UNSUPPORTED_SNAPSHOT_VERSION. | Snapshot load and upgrades |
| R5 — resolved | Are the exact field/action names and SQL design in CONTRACT.md acceptable? | D055 approves repeated lifecycle no-ops, D056 initial revision/CREATE history, D057 cancelled-draft stream recovery, D058 SSE operational failure status including reconnect delivery, and D059 scheduler.error plus specified failure codes. D060 approves the remaining snapshot/envelope/action/route/history/presence vocabulary, status/error mapping, and documented SQL table design. Contract frozen; preserve confirmed behavior. | Backend/frontend coordination |

Other exact implementation choices (e.g. stable dependency versions, SQL
constraint spelling, bounded stream queue/page defaults, identifiers for opaque
world/subscription IDs) can be selected and recorded during setup if they do not
change behavior. Limits must not become undocumented robot queue caps. If a
limit changes accepted inputs or visible behavior, raise it explicitly.

No user approval is needed to keep writing these planning artifacts. No future
agent may use this document as authorization to implement the current chat.
