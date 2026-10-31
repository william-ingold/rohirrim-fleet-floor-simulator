# Review items before dependent implementation

These are gaps found while designing the handoff, not new approved decisions.
The user asked to resolve behavior before implementation. Do not hide these as
coding defaults. Resolve affected items with the user, then update DECISIONS.md
and CONTRACT.md. Unaffected documentation/design work can continue.

| ID | Question | Recommendation and reason | Affects |
| --- | --- | --- | --- |
| R1 | What does CANCEL return after deleting a draft? The ordinary success envelope requires a snapshot that no longer exists. | A 200 cancellation receipt `{worldId, cancelled: true}`; return to creation only after commit. Close draft streams; a subsequent GET is 404. Explicit exception to the ordinary state envelope, without a fourth retained lifecycle state. | API, client navigation, cancellation tests |
| R2 | Where is adjustable playback speed held, and what is the initial value? | Local UI selection, passed as `tickIntervalMs` on PLAY; propose 1000ms initially. Keep it in the running scheduler, outside logical simulation state; restart already returns Paused. Change selection while Setup/Paused, not as a world edit during Playing. Validate a positive safe integer; usable UI range needs review rather than a hidden engine limit. | PLAY DTO, scheduler, controls |
| R3 | Is the supported deployment one Nest process? | Explicitly support one API process with one shared per-world action serializer, stream publisher, and presence registry. Do not claim replicas/multiple independently running API processes coordinate leases or broadcasting. No distributed lock/broker for this bounded submission. | Startup recovery, transactions, streams |
| R4 | Should unsupported snapshot versions migrate automatically? | Fail with a clear unsupported-version error; do not reset saved worlds. SQL migrations remain versioned; JSON version upgrades need explicit migrations if introduced. | Snapshot load and upgrades |
| R5 | Are the exact field/action names and SQL design in CONTRACT.md acceptable? | Review/freeze the proposed shapes as implementation vocabulary; preserve the already-approved behavior. This is a boundary review, not a request to reopen the domain. | Backend/frontend coordination |

Other exact implementation choices (e.g. stable dependency versions, SQL
constraint spelling, bounded stream queue/page defaults, identifiers for opaque
world/subscription IDs) can be selected and recorded during setup if they do not
change behavior. Limits must not become undocumented robot queue caps. If a
limit changes accepted inputs or visible behavior, raise it explicitly.

No user approval is needed to keep writing these planning artifacts. No future
agent may use this document as authorization to implement the current chat.
