# Run commands

Run these commands in WSL Ubuntu. The Docker workflow needs Docker Desktop
running with **Settings → Resources → WSL Integration → Ubuntu** enabled.

## Docker: start the complete app

```bash
cd ~/rohirrim
./run.sh                 # build, start in the background, wait for healthy services
./run.sh status          # show health and ports
./run.sh logs            # follow both services; Ctrl-C exits the log viewer
./run.sh logs api        # follow only the API
./run.sh logs web        # follow only nginx
./run.sh stop            # stop/remove containers; keep saved worlds
./run.sh help            # usage
```

Open **http://localhost:18080**. The direct API base is
**http://localhost:3000/api**; the frontend calls the API through its own web
port. The API base is a prefix for routes such as `/api/worlds`, not a home page.
The startup script prints the actual published addresses.

Run `./run.sh` again after changing source code to rebuild the production app.
It works when invoked from another directory, for example
`~/rohirrim/run.sh status`. Docker builds dependencies inside the images, so
this workflow needs neither host Node nor a host `npm ci`.

To select different host ports:

```bash
WEB_PORT=18081 API_PORT=3001 ./run.sh
```

Reuse the same overrides for subsequent starts/rebuilds to keep those ports.
SQLite is stored in the `fleet-data` named volume, independently of any native
API database. Normal stop/start preserves it. `docker compose down --volumes`
deletes the Docker database as well as stopping the app.

The equivalent commands without the helper are:

```bash
docker compose up --build -d --wait
docker compose ps
docker compose logs --tail 100 -f
docker compose down
```

## Native WSL: develop with Vite hot reload

Node 26.13.0 is installed persistently through nvm at
`~/.nvm/versions/node/v26.13.0`. New Bash terminals load it automatically. For
an existing terminal, load nvm and select the repository version:

```bash
cd ~/rohirrim
source "$HOME/.nvm/nvm.sh"
nvm use
node --version                   # v26.13.0
node -p process.platform          # linux
npm ci                           # first setup, or after the lockfile changes
```

Stop the Docker app before starting the native API on the same port:

```bash
./run.sh stop
```

Then use two WSL terminals, each in `~/rohirrim` with `nvm use`:

```bash
# Terminal 1: builds and runs the API on http://127.0.0.1:3000
npm run start:api

# Terminal 2: starts Vite, normally at http://127.0.0.1:5173
npm run dev
```

Open the URL printed by Vite. It proxies `/api` and live updates to port 3000.
The native API stores saved worlds in `~/rohirrim/fleet-floor.sqlite` by default.
Press Ctrl-C in each terminal to stop its process. To select another native
database, use `DATABASE_PATH=/absolute/path/worlds.sqlite npm run start:api`;
the parent directory must already exist and be writable.

## Verification

```bash
npm run test:http       # build and check HTTP/startup behavior
npm run typecheck       # TypeScript and Svelte diagnostics
npm test                # build and run the full test suite
npm run test:scenario   # CLI checks, including all five original test-scenarios files
npm run test:browser    # production Chromium checks; requires installed browser
```

Install Chromium once with `npx playwright install chromium`. If the standard
test ports 3000/5173 are occupied, keep other services running and use
`FLEET_TEST_API_PORT=3101 FLEET_TEST_WEB_PORT=5273 npm run test:browser` with two
free ports. The browser suite uses its own temporary SQLite database. See
[Phase 6 results](docs/handoff/PHASE6_RESULTS.md) for executed review evidence.

If Docker cannot be reached, start Docker Desktop and check Ubuntu integration.
If startup reports a port binding error, stop the process using that port or use
the port overrides above. If native npm invokes Windows CMD or reports
`C:\Windows\package.json`, reload nvm and verify `command -v node` and
`command -v npm` both resolve under `~/.nvm`.
