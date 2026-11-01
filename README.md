# Fleet Floor Simulator

Quick start in WSL: run `./run.sh`, then open **http://localhost:18080**.
Docker Desktop must be running with Ubuntu WSL integration enabled.
Use `./run.sh status`, `./run.sh logs`, and `./run.sh stop` to manage it.
See [run commands](RUNNING.md) for Docker, native development, and verification.

Phase 1 / B1 implements the pure immutable engine for the core, module A (GOTO),
and module B (battery/chargers). Phase 2 / B2 adds the isolated scenario CLI.
Phase 3 / B3 adds SQLite migrations and the durable application service.
Phase 3 / B4 adds the Nest HTTP API and a post-commit publication seam.
Phase 4 / B5 adds generation-safe scheduling, transient presence and bounded SSE.
Phase 5 adds the Svelte/Vite workbench and browser HTTP/SSE/presence integration.
Phase 6 reviews the complete path and records fixes, test evidence, and limits in
[Phase 6 results](docs/handoff/PHASE6_RESULTS.md).

Selected depth modules are **A (GOTO)** and **B (battery/chargers)**: they deepen
the shared engine's deterministic movement and interacting tick rules. Module C
timeline/fork is omitted. Live tab synchronization is implemented, but full module
D completion is not claimed.

Use Node **26.13.0** (also pinned in `.nvmrc`) and its bundled npm:

```sh
npm ci
npm test
npm run typecheck
npm run build
```

## WSL setup

Install Linux Node inside Ubuntu rather than using Windows Node from `/mnt/c`.
Windows npm invokes CMD, which cannot use a WSL UNC working directory and can
fall back to `C:\Windows`, causing a missing `package.json` error.

Install [nvm](https://github.com/nvm-sh/nvm#installing-and-updating) once in WSL:

```sh
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.8/install.sh -o /tmp/nvm-install.sh
bash /tmp/nvm-install.sh
. "$HOME/.nvm/nvm.sh"
cd ~/rohirrim
nvm install
nvm use
nvm alias default 26.13.0
```

Node lives under `~/.nvm/versions/node/`, and nvm initializes in new interactive
Bash terminals. Only the installer download uses `/tmp`. Run `nvm use` when
returning to this repository after working on another Node version.
`command -v node` and `command -v npm` should both point under `~/.nvm`, and
`node -p process.platform` should print `linux`. Then run `npm ci` and the normal
commands above.

## Run everything in Docker

Start Docker Desktop with the WSL 2 engine and enable Ubuntu in **Settings →
Resources → WSL Integration**. See [Docker's WSL setup](https://docs.docker.com/desktop/features/wsl/).
From the repository root:

```sh
docker compose up --build -d --wait
```

Open **http://localhost:18080**. Compose builds Linux dependencies and the
TypeScript/Svelte code inside the images; host Node and host `node_modules` are
not needed. The web container serves the production Vite build through nginx
and proxies `/api`, including unbuffered SSE, to the API container. The API is
also available directly at **http://localhost:3000/api**. Published ports bind
only to host loopback. If those ports are occupied, use:

```sh
WEB_PORT=18081 API_PORT=3001 docker compose up --build -d --wait
```

SQLite lives at `/data/fleet-floor.sqlite` in the `fleet-data` named volume.
It survives container replacement and `docker compose down`. This is a separate
database from any locally started API. The API runs as the unprivileged Node
user and starts only after migrations/recovery; the web service waits for the
API health check. Node runs directly so shutdown signals reach the application.

```sh
docker compose logs -f          # follow service output; Ctrl-C exits the log viewer
docker compose ps              # service and health status
docker compose down            # stop and remove containers, preserving saved worlds
docker compose up --build -d --wait  # rebuild after source changes
```

`docker compose down --volumes` also deletes saved Docker worlds. This setup uses
production builds; use the two-terminal workbench workflow below for Vite hot
reload. Docker explicitly sets `HOST=0.0.0.0` so other containers can reach the
API; local `npm run start:api` continues to bind `127.0.0.1` by default.

`npm run test:engine` runs only engine tests. `npm run test:scenario` builds and
runs CLI tests, including real child processes. `npm test` builds all four workspaces
before running all tests: Vitest for engine/CLI and Svelte UI, Jest for
SQLite/HTTP/bootstrap/playback/SSE. The build emits the public `@rohirrim/engine`
workspace export, scenario executable, API and production web assets.
`npm run test:persistence` builds engine/API and
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
The CLI process suite executes all five original `test-scenarios/*.txt` files
and compares their REPORT output exactly, including both reports in scenario 5.

The engine owns simultaneous movement, validated snapshots, immutable queues,
setup/paused/playing/ended guards and t0 capture. It has no runtime dependencies
on frameworks, storage, timers or network. Turns and blocked moves are free;
the approved battery example yields **98**, resolving the brief's conflicting 97.

See [B4 results and HTTP fixtures](docs/handoff/B4_RESULTS.md) for the B4
HTTP scope, validation and publication seam,
[B3 results and setup](docs/handoff/B3_RESULTS.md) for current red/green
evidence, SQLite setup, service types and remaining work,
[B2 results](docs/handoff/B2_RESULTS.md) for CLI evidence, and
[B1 results](docs/handoff/B1_RESULTS.md) for the public engine shapes.
[HANDOFF.md](HANDOFF.md), [DECISIONS.md](DECISIONS.md) and
[ARCHITECTURE.md](ARCHITECTURE.md) retain the planning record; their earlier
planning-only status describes that session. This implementation is limited to
the separately authorized B1/B2/B3/B4/B5, phase 5, and phase 6 review slices. AI contributions are in [AI_USAGE.md](AI_USAGE.md).

Start the local HTTP API after installation:

```sh
DATABASE_PATH=/tmp/fleet-floor.sqlite PORT=3000 npm run start:api
```

The command builds engine/API, completes migrations/validation/restart recovery,
then listens on `127.0.0.1` (override with `HOST` for containers). Defaults are port 3000 and `fleet-floor.sqlite` in the
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

B5 adds `GET /api/worlds/:id/events` (SSE) and `POST /api/worlds/:id/presence`.
Open an SSE stream, Finish Setup, then PLAY with `tickIntervalMs` (100..5000).
Renew the current `stream.ready` subscriptionId every 5s; its lease expires at
15s. Closed streams retain remaining grace, but their IDs cannot renew. Last
expiry commits Pause with NO_CLIENTS; reconnect requires explicit Play afterward.

`runningTickIntervalMs` reports operational playback separately from saved state.
After `scheduler.error`, it is null while the last committed lifecycle remains;
recover with PAUSE then PLAY. SSE starts with ready/current snapshot and revision
IDs on world events. Reconnect ignores Last-Event-ID and sends current state;
fetch missed history separately. Streams close for resync at 64 queued frames or
1MiB pending/socket bytes. Cancellation closes draft streams. Shutdown releases
streams and timers before the DB closes.

Run `npm run test:playback` for focused scheduler/presence/real HTTP SSE tests.
See [B5 results](docs/handoff/B5_RESULTS.md) for exact protocol fixtures, TDD
results, transport limits and remaining acceptance IDs. Frontend/browser validation and remaining verification limits are recorded in
[phase 5 results](docs/handoff/PHASE5_RESULTS.md).


## Run the workbench

With Node 26.13.0 and dependencies installed, use two terminals:

```sh
# Terminal 1: real durable API, port 3000
DATABASE_PATH=/tmp/fleet-floor.sqlite npm run start:api

# Terminal 2: Svelte/Vite, normally http://127.0.0.1:5173
npm run dev
```

Vite proxies `/api` (including SSE) to the local API, so no CORS setup is needed.
Create defaults to 10 × 8. Place robots/features, select a robot, queue commands,
and use the selected-robot inspector to set facing immediately or Delete robot
during Setup. Deletion also removes that robot's queue. These controls are
available only before Finish Setup; facing changes preserve queued commands.
Finish Setup before Step or Play. Up queues Forward/MOVE relative to facing;
Left/Right queue turns. Shortcuts apply in the floor/command area, away from
inputs. C toggles cursor navigation; Enter applies the current tool/selects,
and Shift+Enter or Shift-click queues GOTO for the selected robot. Typed GOTO
coordinates and visible command buttons also work on touch and keyboard.

The server owns ticks, positions, battery, queues, lifecycle, and history.
The tab shows only committed updates; connection loss retains a labelled last
view. Keep the `?world=...` URL to restore a world after refresh. Reconnecting
never resumes a world that the server paused. A stopped scheduler requires Pause,
then Play. The Next Play interval starts at 1000 ms after refresh, independently
of the server's currently running interval.

`npm run build` emits `apps/web/dist/` alongside existing engine/CLI/API output.
For a local production-build preview, keep the API running and use
`npm exec --workspace @rohirrim/web -- vite preview --host 127.0.0.1`.
Hosting must serve those static assets and route `/api` to the single Nest
process; this phase does not configure or publish a deployment.

```sh
npm run test:web       # isolated session/component/presentation checks
npx playwright install chromium  # once, for browser checks
npm run test:browser   # builds, then runs Chromium with its own temporary API/DB
```

Browser checks require free ports 3000 and 5173; stop development servers first.
They cover real creation/setup/playback/refresh/end, 20 × 20 with 60 robots,
390 px layout, heartbeats/lease expiry, second-tab cancellation, history scrolling,
and SQL-triggered scheduler failure/recovery. Screenshots are retained under
[docs/handoff/phase5/screenshots/](docs/handoff/phase5/screenshots/).
No assistive-technology certification, cross-browser or performance claim is made.

To leave existing services running, select two free browser-test ports:

```sh
FLEET_TEST_API_PORT=3101 FLEET_TEST_WEB_PORT=5273 npm run test:browser
```

Tests always start their own API and production preview; they never reuse an
existing server. They also check real history-write rollback with no broadcast,
and recovery when a disconnected tab misses another tab's Pause/Play.
Set `FLEET_TEST_SCREENSHOTS=/tmp/fleet-review-captures` to keep review captures
separate from the retained Phase 5 screenshots.

## CLI commands and UI equivalents

The CLI accepts the complete core and selected A/B command vocabulary. The UI
has controls for simulation and state inspection, rather than a command prompt.

| Scenario directive | Workbench control or display |
| --- | --- |
| `FLOOR W,H` | Create world; Width/Height and Apply size during Setup |
| `OBSTACLE X,Y` | Obstacle tool, then click a cell; UI also removes obstacles |
| `PLACE Rn X,Y,F` | Click an empty cell for an automatic ID and North facing; select a robot for Setup facing controls |
| `QUEUE Rn MOVE LEFT RIGHT` | Select a robot; Forward/Left/Right buttons or Up/Left/Right keys append commands |
| `QUEUE Rn GOTO X,Y` | Queue GOTO inputs, Pick on floor, or Shift-click/Shift+Enter |
| `TICK` | Finish Setup, then Step advances exactly one tick |
| `TICK N` | Repeat Step N times; no exact-N batch control. Play runs until paused, ended, or stopped |
| `REPORT` | Current floor, inspector and All robots show IDs, positions and facings; no text report/export button |
| `CHARGER X,Y` | Charger tool, then click a cell; UI also removes chargers |
| `REPORT BATTERY` | Battery values in the inspector and All robots |

`REPORT` and `TICK` are file directives; the brief names the UI tick button
**Step**. Reports do not run commands or advance time. UI defaults to 10 × 8;
CLI defaults to 5 × 5. UI resize preserves contents or rejects the resize;
CLI FLOOR replaces an unfinished draft. The UI does not offer explicit robot IDs
or direct relocation of an existing robot. Setup deletion and facing edits are
available under D065; moving an existing robot afterward uses queued commands.
