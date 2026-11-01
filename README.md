# Fleet Floor Simulator

Phase 1 / B1 implements the pure immutable engine for the core, module A (GOTO),
and module B (battery/chargers). The API, UI, database, scheduler, streams and
scenario runner are not implemented yet.

Use Node **26.13.0** (also pinned in `.nvmrc`) and its bundled npm:

```sh
npm ci
npm test
npm run typecheck
npm run build
```

`npm run test:engine` runs only engine tests. The build emits the public
`@rohirrim/engine` workspace export; consumers must build before importing it.
The mandatory `npm run scenario -- path/to/scenario.txt` command is B2 work and
does not exist in this slice.

The engine owns simultaneous movement, validated snapshots, immutable queues,
setup/paused/playing/ended guards and t0 capture. It has no runtime dependencies
on frameworks, storage, timers or network. Turns and blocked moves are free;
the approved battery example yields **98**, resolving the brief's conflicting 97.

See [B1 results and next-slice handoff](docs/handoff/B1_RESULTS.md) for actual
red/green evidence, acceptance coverage, public shapes and remaining work.
[HANDOFF.md](HANDOFF.md), [DECISIONS.md](DECISIONS.md) and
[ARCHITECTURE.md](ARCHITECTURE.md) retain the planning record; their earlier
planning-only status describes that session. This implementation is limited to
the separately authorized B1 slice. AI contributions are in [AI_USAGE.md](AI_USAGE.md).
