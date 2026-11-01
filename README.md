# Fleet Floor Simulator

Phase 1 / B1 implements the pure immutable engine for the core, module A (GOTO),
and module B (battery/chargers). Phase 2 / B2 adds the isolated scenario CLI.
Phase 3 / B3 adds SQLite migrations and the durable application service.
Phase 3 / B4 adds the Nest HTTP API and a post-commit publication seam.
The UI, scheduler, presence and SSE streams remain unimplemented.

Use Node **26.13.0** (also pinned in `.nvmrc`) and its bundled npm:

```sh
npm ci
npm test
npm run typecheck
npm run build
```

`npm run test:engine` runs only engine tests. `npm run test:scenario` builds and
runs CLI tests, including real child processes. `npm test` builds all three workspaces
before running all tests: Vitest for engine/CLI, Jest for SQLite/HTTP/bootstrap. The build emits
the public `@rohirrim/engine` workspace export, scenario executable and API. `npm run test:persistence` builds engine/API and
runs SQLite tests only; `npm run test:http` builds and runs HTTP/bootstrap tests.
The scenario command builds only engine/CLI and opens no database.

Run a scenario from the repository root without an API or database:

```sh
npm run scenario -- scenarios/chain.txt
npm run scenario -- scenarios/goto-charger.txt
```

The root command builds both workspaces automatically. npm prints script banners;
for exact REPORT-only stdout after `npm run build`, use:

```sh
node apps/scenario/dist/main.js scenarios/chain.txt
```

Each invocation starts an independent in-memory 5 x 5 floor. Supports FLOOR,
PLACE, OBSTACLE, CHARGER, QUEUE (MOVE/LEFT/RIGHT/GOTO X,Y), TICK [N], REPORT and
REPORT BATTERY. Keywords/facings are case-insensitive, IDs normalize leading
zeros, and spaces/tabs around commas are accepted. Whole-line `#` comments are
ignored; inline comments or trailing junk reject the entire line. Invalid lines
leave state unchanged and processing continues. Missing/unreadable files or bad
invocation print errors on stderr and exit nonzero.

FLOOR replaces all draft contents only before the first valid TICK. REPORT does
not finish setup; the first valid TICK captures t0 then steps. EOF finishes setup
if necessary and ends without draining queues, adding ticks or printing a final
report. Inputs in [scenarios/](scenarios/) have separate `.stdout` expectations;
the original mixed input/output `test-scenarios/` references remain unchanged.

The engine owns simultaneous movement, validated snapshots, immutable queues,
setup/paused/playing/ended guards and t0 capture. It has no runtime dependencies
on frameworks, storage, timers or network. Turns and blocked moves are free;
the approved battery example yields **98**, resolving the brief's conflicting 97.

See [B4 results and HTTP fixtures](docs/handoff/B4_RESULTS.md) for the current
HTTP scope, validation and B5 handoff,
[B3 results and setup](docs/handoff/B3_RESULTS.md) for current red/green
evidence, SQLite setup, service types and remaining work,
[B2 results](docs/handoff/B2_RESULTS.md) for CLI evidence, and
[B1 results](docs/handoff/B1_RESULTS.md) for the public engine shapes.
[HANDOFF.md](HANDOFF.md), [DECISIONS.md](DECISIONS.md) and
[ARCHITECTURE.md](ARCHITECTURE.md) retain the planning record; their earlier
planning-only status describes that session. This implementation is limited to
the separately authorized B1/B2/B3/B4 slices. AI contributions are in [AI_USAGE.md](AI_USAGE.md).

Start the local HTTP API after installation:

```sh
DATABASE_PATH=/tmp/fleet-floor.sqlite PORT=3000 npm run start:api
```

The command builds engine/API, completes migrations/validation/restart recovery,
then listens on `127.0.0.1`. Defaults are port 3000 and `fleet-floor.sqlite` in the
current directory. The caller supplies an existing writable parent directory.
SIGINT/SIGTERM close the server and database. Keep `apps/api/migrations/` next to
the built workspace as described in B3_RESULTS.md. An invalid port, migration,
unsupported version or corrupt saved snapshot prevents startup.

```sh
curl -H 'Content-Type: application/json' -d '{"width":2,"height":1}' http://127.0.0.1:3000/api/worlds
curl http://127.0.0.1:3000/api/worlds/WORLD_ID
curl -H 'Content-Type: application/json' -d '{"type":"FINISH_SETUP"}' http://127.0.0.1:3000/api/worlds/WORLD_ID/actions
curl -H 'Content-Type: application/json' -d '{"type":"STEP"}' http://127.0.0.1:3000/api/worlds/WORLD_ID/actions
curl 'http://127.0.0.1:3000/api/worlds/WORLD_ID/history?afterRevision=0&throughRevision=3&limit=100'
```

Replace WORLD_ID with the creation response's `worldId`. Create returns 201;
reads/actions return 200, including blocked Steps. Cancel returns the disposal
receipt, then reads return 404. Unknown fields and malformed JSON/actions reject
atomically. History defaults to 100 entries (maximum 500); retain a fixed
throughRevision during catch-up. No expectedRevision or automatic mutation retry.
The [GOTO fixture](apps/api/test/fixtures/goto-step.json) contains exact sample
actions and the expected committed response, normalizing only IDs/timestamps.

PLAY still rejects new playback until B5 supplies presence and scheduling.
`runningTickIntervalMs` is currently null. Events and presence routes are not
implemented; B4 does not claim browser readiness or real streaming validation.
