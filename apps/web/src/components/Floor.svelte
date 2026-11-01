<script lang="ts">
  import { tick } from 'svelte';
  import type { Position, WorldResponse, RobotTickOutcome } from '../lib/types.js';
  import { facingName, same } from '../lib/presentation.js';
  import Marker from './Marker.svelte';
  let { world, previous, selectedId, tool, editable, pendingPosition, rejectedPosition, adjacent, reduced, stale, cursorMode, lastOutcomes, oncell, oncursor }: {
    world: WorldResponse; previous: WorldResponse | null; selectedId: string; tool: string; editable: boolean;
    lastOutcomes: readonly RobotTickOutcome[]; pendingPosition: Position | null; rejectedPosition: Position | null; adjacent: boolean; reduced: boolean; stale: boolean; cursorMode: boolean;
    oncell: (p: Position, shift: boolean) => void; oncursor: (mode: boolean) => void;
  } = $props();
  let root: HTMLDivElement; let scroller: HTMLDivElement; let available = $state(600); let large = $state(false);
  let cursor = $state<Position>({ x: 0, y: 0 }); let pointer = $state<Position | null>(null);
  let cell = $derived(large ? 44 : Math.max(30, Math.min(72, Math.floor((available - 36) / world.state.width))));
  let positions = $derived(Array.from({ length: world.state.height }, (_, row) => Array.from({ length: world.state.width }, (_, x) => ({ x, y: world.state.height - row - 1 }))));
  let readPosition = $derived(pointer ?? cursor);
  let readRobot = $derived(world.state.robots.find(r => same(r.position, readPosition)));
  let robotByCell = $derived(new Map(world.state.robots.map(r => [`${r.position.x},${r.position.y}`, r])));
  let obstacles = $derived(new Set(world.state.obstacles.map(p => `${p.x},${p.y}`)));
  let chargers = $derived(new Set(world.state.chargers.map(p => `${p.x},${p.y}`)));
  let previousById = $derived(new Map(previous?.state.robots.map(r => [r.id, r]) ?? []));
  let outcomes = $derived(new Map(lastOutcomes.map(o => [o.robotId, o])));
  let trails = $derived(new Map(world.state.robots.flatMap(r => { const prev = previousById.get(r.id); return prev && !same(prev.position, r.position) ? [[`${prev.position.x},${prev.position.y}`, r.id] as const] : []; })));
  let target = $derived(world.state.robots.find(r => r.id === selectedId)?.queue.find(c => c.type === 'GOTO'));
  $effect(() => {
    if (!root || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => { available = entries[0]?.contentRect.width ?? 600; });
    observer.observe(root); return () => observer.disconnect();
  });
  $effect(() => {
    const selected = world.state.robots.find(r => r.id === selectedId);
    if (selected) {
      cursor = selected.position;
      const size = cell;
      void tick().then(() => {
        if (!scroller) return;
        const x = selected.position.x * size + 28, y = (world.state.height - selected.position.y - 1) * size;
        if (x < scroller.scrollLeft + 28 || x + size > scroller.scrollLeft + scroller.clientWidth) scroller.scrollLeft = Math.max(0, x - (scroller.clientWidth - size) / 2);
        if (y < scroller.scrollTop || y + size > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = Math.max(0, y - (scroller.clientHeight - size) / 2);
      });
    }
  });
  $effect(() => { if (cursor.x >= world.state.width || cursor.y >= world.state.height) cursor = { x: Math.min(cursor.x, world.state.width - 1), y: Math.min(cursor.y, world.state.height - 1) }; });
  async function keyboard(event: KeyboardEvent) {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    if (!cursorMode && selectedId) return;
    const delta: Record<string, [number, number]> = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const offset = delta[event.key];
    if (offset) {
      event.preventDefault(); event.stopPropagation();
      cursor = { x: Math.max(0, Math.min(world.state.width - 1, cursor.x + offset[0])), y: Math.max(0, Math.min(world.state.height - 1, cursor.y + offset[1])) };
      await tick(); root.querySelector<HTMLElement>(`[data-x="${cursor.x}"][data-y="${cursor.y}"]`)?.focus();
    } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); oncell(cursor, event.shiftKey); }
  }
  function cellName(p: Position) {
    const robot = robotByCell.get(`${p.x},${p.y}`), obstacle = obstacles.has(`${p.x},${p.y}`), charger = chargers.has(`${p.x},${p.y}`);
    return `x ${p.x}, y ${p.y}, ${robot ? `${robot.id} facing ${facingName(robot.facing)}, battery ${robot.battery}${robot.id === selectedId ? ', selected' : ''}` : obstacle ? 'obstacle' : 'empty'}${charger ? ', charger' : ''}${stale ? ', last known' : ''}`;
  }
</script>
<div class="floor-section" bind:this={root}>
  <div class="bar floor-options"><span class="small">Cell size</span><button aria-pressed={!large} onclick={() => large = false}>Fit</button><button aria-pressed={large} onclick={() => large = true}>Large (44 px)</button><span class="hint">Scroll the floor when it exceeds the panel.</span></div>
  <div class="floor-scroll" bind:this={scroller} style:--cell="{cell}px" style:--width={world.state.width} style:--height={world.state.height}>
    <div class="floor-layout" class:stale>
      <div class="corner" aria-hidden="true">N ↑</div>
      <div class="y-axis" aria-hidden="true">{#each positions as row}<span>{row[0]?.y}</span>{/each}</div>
      <div class="floor-grid" role="grid" tabindex="-1" aria-label="Robot floor, southwest origin" aria-rowcount={world.state.height} aria-colcount={world.state.width} onkeydown={keyboard}>
        {#each positions as row}<div role="row" class="floor-row">{#each row as p}
          {@const robot = robotByCell.get(`${p.x},${p.y}`)}
          {@const obstacle = obstacles.has(`${p.x},${p.y}`)}
          {@const charger = chargers.has(`${p.x},${p.y}`)}
          {@const outcome = robot ? outcomes.get(robot.id) : undefined}
          {@const from = !stale ? trails.get(`${p.x},${p.y}`) : undefined}
          <div role="gridcell" tabindex={same(cursor, p) ? 0 : -1} aria-label={cellName(p)} aria-selected={!!robot && robot.id === selectedId}
            data-x={p.x} data-y={p.y} class="cell" class:obstacle class:charger class:overlap={obstacle && charger}
            class:pending-cell={!!pendingPosition && same(pendingPosition, p)} class:rejected-cell={!!rejectedPosition && same(rejectedPosition, p)} aria-busy={!!pendingPosition && same(pendingPosition, p)}
            class:floor-cursor={cursorMode && same(cursor, p)} class:target={target?.type === 'GOTO' && same(target.target, p)}
            style:grid-column={p.x + 1} style:grid-row={world.state.height - p.y}
            onfocus={() => cursor = p} onmouseenter={() => pointer = p} onmouseleave={() => pointer = null}
            onclick={event => { cursor = p; oncell(p, event.shiftKey); }}
            onkeydown={event => { if (selectedId && !cursorMode && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); oncell(p, event.shiftKey); } }}>
            {#if cell >= 40}<span class="cell-coordinate" aria-hidden="true">{p.x},{p.y}</span>{/if}
            {#if charger}<span class="charger-bolt" aria-hidden="true">ϟ</span>{/if}
            {#if from}<span class="came-from" aria-hidden="true">·</span>{/if}
            {#if robot}
              <Marker {robot} previous={previousById.get(robot.id)} selected={robot.id === selectedId} {stale} {adjacent} {reduced} interval={world.runningTickIntervalMs ?? 1000} {cell}/>
              {#key world.revision}
              {#if outcome?.movement.status === 'BLOCKED'}<span class="blocked-edge {robot.facing.toLowerCase()}" style:animation={adjacent && !reduced && (world.runningTickIntervalMs ?? 1000) >= 500 ? `edge-in 160ms ease-out ${(outcome.command.status === 'CONTINUING' && previousById.get(robot.id)?.facing !== robot.facing) ? 100 : 0}ms backwards` : 'none'} aria-hidden="true"></span><span class="outcome-badge blocked" aria-hidden="true">!</span>
              {:else if outcome?.command.status === 'ABANDONED'}<span class="outcome-badge blocked" aria-hidden="true">no path</span>
              {:else if outcome?.command.status === 'COMPLETED' && outcome.command.type === 'GOTO'}<span class="outcome-badge success" aria-hidden="true">✓</span>{#if adjacent && !reduced && (world.runningTickIntervalMs ?? 1000) >= 500}<span class="arrival-ring" aria-hidden="true"></span>{/if}
              {:else if robot.queue[0]?.type === 'GOTO' && robot.queue[0].consecutiveNoPathTicks > 0}<span class="outcome-badge blocked" aria-hidden="true">{robot.queue[0].consecutiveNoPathTicks}/3</span>{/if}
              {/key}
              {#if robot.battery === 0}<span class="empty-badge" aria-hidden="true">0</span>{/if}
            {/if}
          </div>
        {/each}</div>{/each}
      </div>
      <div class="x-axis" aria-hidden="true">{#each Array.from({ length: world.state.width }, (_, x) => x) as x}<span>{x}</span>{/each}</div>
    </div>
  </div>
  <div class="axis-labels small mono"><span>y north ↑</span><span>x east →</span></div>
  <p class="floor-readout mono small">{pointer ? 'Pointer' : 'Cursor'} at ({readPosition.x},{readPosition.y}): {readRobot ? `${readRobot.id}, facing ${facingName(readRobot.facing)}, battery ${readRobot.battery}, ${readRobot.queue.length} commands queued.` : obstacles.has(`${readPosition.x},${readPosition.y}`) ? 'obstacle.' : 'empty.'} {#if editable && !pendingPosition && tool === 'robot' && !readRobot}Click to place a robot facing North.{/if}</p>
  <div class="bar"><button aria-pressed={cursorMode} onclick={() => oncursor(!cursorMode)}>Floor cursor (C)</button><span class="hint">{cursorMode || !selectedId ? 'Arrows move the cursor. Enter selects or applies the tool.' : 'Arrows queue commands. C switches to cursor navigation.'} Shift+Enter queues GOTO.</span></div>
</div>
