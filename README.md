# Fleet Floor Simulator

Phase 1 / B1 implements the pure immutable engine for the core, module A (GOTO),
and module B (battery/chargers). Phase 2 / B2 adds the isolated scenario CLI.
The API, UI, database, scheduler and streams are not implemented yet.

Use Node **26.13.0** (also pinned in `.nvmrc`) and its bundled npm:

```sh
npm ci
npm test
npm run typecheck
npm run build
```

`npm run test:engine` runs only engine tests. `npm run test:scenario` builds and
runs CLI tests, including real child processes. `npm test` builds both workspaces
before running all tests. The build emits the public `@rohirrim/engine` workspace
export and the scenario executable.

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

See [B2 results and next-slice handoff](docs/handoff/B2_RESULTS.md) for current
red/green evidence, acceptance coverage and remaining work, and
[B1 results](docs/handoff/B1_RESULTS.md) for the public engine shapes.
[HANDOFF.md](HANDOFF.md), [DECISIONS.md](DECISIONS.md) and
[ARCHITECTURE.md](ARCHITECTURE.md) retain the planning record; their earlier
planning-only status describes that session. This implementation is limited to
the separately authorized B1/B2 slices. AI contributions are in [AI_USAGE.md](AI_USAGE.md).
