<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { CommandInput, Facing, Lifecycle, Position, WorldAction } from '../lib/types.js';
  import type { SessionView } from '../lib/session.js';
  import { facingName, outcomeText, same } from '../lib/presentation.js';
  import Floor from './Floor.svelte';
  import Marker from './Marker.svelte';
  import Battery from './Battery.svelte';
  import Queue from './Queue.svelte';
  import History from './History.svelte';
  let { view, act, createAnother, retryHistory }: { view: SessionView; act: (action: WorldAction) => Promise<boolean>; createAnother: () => void; retryHistory: () => void } = $props();
  let narrow = $state(false); let inspectorOpen = $state(true); let robotsOpen = $state(true);
  let selectedId = $state(''); let tool = $state('robot'); let cursorMode = $state(false); let pickTarget = $state(false);
  let width = $state<number | undefined>(); let height = $state<number | undefined>(); let interval = $state<number | undefined>(1000);
  let targetX = $state<number | undefined>(0); let targetY = $state<number | undefined>(0); let localError = $state('');
  let pendingPosition = $state<Position | null>(null); let rejectedPosition = $state<Position | null>(null);
  let filter = $state(''); let reduced = $state(false); let delayedPending = $state(''); let announcement = $state('');
  const lifecycleNames: Record<Lifecycle, string> = { SETTING_UP: 'Setting Up', PAUSED: 'Paused', PLAYING: 'Playing', ENDED: 'Ended' };
  const permissions: Record<Lifecycle, string> = {
    SETTING_UP: 'Size the floor, place robots and features, and queue commands. No ticks run until you finish setup.',
    PAUSED: 'Edit the floor and queues, step one tick, or press Play.',
    PLAYING: 'Pause to edit the floor or queues.', ENDED: 'This world has ended and is read-only.',
  };
  let world = $derived(view.world!); let floorState = $derived(world.state); let lifecycle = $derived(floorState.lifecycle);
  let selected = $derived(floorState.robots.find(r => r.id === selectedId));
  let editable = $derived((lifecycle === 'SETTING_UP' || lifecycle === 'PAUSED') && view.connection === 'live' && !view.pending);
  let available = $derived(view.connection === 'live' && !view.pending);
  let setupEditable = $derived(lifecycle === 'SETTING_UP' && editable);
  const facings: readonly Facing[] = ['NORTH', 'EAST', 'SOUTH', 'WEST'];
  $effect(() => { if (selectedId && !floorState.robots.some(r => r.id === selectedId)) { selectedId = ''; pickTarget = false; } });
  let reason = $derived(view.connection !== 'live' ? 'Wait for the simulator connection.' : view.pending ? 'Wait for the current change to finish.' : permissions[lifecycle]);
  let outcomes = $derived(world.historyEntries.flatMap(e => e.effects.outcomes ?? []));
  let lastTickEntry = $derived([...view.history].reverse().find(e => e.effects.outcomes));
  let lastOutcomes = $derived(outcomes.length ? outcomes : lastTickEntry?.effects.outcomes ?? []);
  let recovery = $derived([...view.history].reverse().find(e => e.action.type === 'PAUSE' || e.action.type === 'PLAY'));
  let intervalValid = $derived(Number.isInteger(interval) && interval! >= 100 && interval! <= 5000);
  let filteredRobots = $derived(floorState.robots.filter(r => r.id.toLowerCase().includes(filter.toLowerCase())));
  $effect(() => { if (width === undefined) width = floorState.width; if (height === undefined) height = floorState.height; });
  $effect(() => {
    const pending = view.pending; delayedPending = '';
    if (pending) { const timeout = setTimeout(() => delayedPending = pending, 150); return () => clearTimeout(timeout); }
  });
  onMount(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)'); reduced = query.matches;
    const screen = matchMedia('(max-width: 759px)'); narrow = screen.matches; inspectorOpen = !narrow; robotsOpen = !narrow;
    const resize = () => { narrow = screen.matches; inspectorOpen = !narrow; robotsOpen = !narrow; }; screen.addEventListener('change', resize);
    const change = () => reduced = query.matches; query.addEventListener('change', change);
    return () => { query.removeEventListener('change', change); screen.removeEventListener('change', resize); };
  });
  function announce() {
    announcement = `${lifecycleNames[lifecycle]}. ${view.connection === 'live' ? 'Connected.' : 'Reconnecting.'} ${selected ? lastOutcomes.filter(o => o.robotId === selected.id).map(o => outcomeText(o)).join(' ') : ''}`;
  }
  $effect(() => {
    if (lifecycle !== 'PLAYING') { announce(); return; }
    untrack(announce);
    const timer = setInterval(announce, 5000); return () => clearInterval(timer);
  });
  async function send(action: WorldAction) {
    localError = ''; rejectedPosition = null;
    const position = 'position' in action ? action.position : null;
    pendingPosition = position;
    try { const applied = await act(action); if (!applied) rejectedPosition = position; return applied; }
    finally { pendingPosition = null; }
  }
  function enqueue(command: CommandInput) { if (editable && selected) void send({ type: 'ENQUEUE_COMMANDS', robotId: selected.id, commands: [command] }); }
  function goto(p: Position) {
    if (!editable || !selected) return;
    if (!Number.isInteger(p.x) || !Number.isInteger(p.y) || p.x < 0 || p.x >= floorState.width || p.y < 0 || p.y >= floorState.height) {
      localError = `Target must be on the floor: x 0 to ${floorState.width - 1}, y 0 to ${floorState.height - 1}.`; return;
    }
    enqueue({ type: 'GOTO', target: p }); pickTarget = false;
  }
  function cell(p: Position, shift: boolean) {
    const robot = floorState.robots.find(r => same(r.position, p));
    if (shift && !selected) { localError = 'Select a robot before choosing a GOTO target.'; return; }
    if ((shift || pickTarget) && selected) { goto(p); return; }
    if (tool === 'robot' && robot) { selectedId = robot.id; localError = ''; return; }
    if (!editable) { if (robot) selectedId = robot.id; return; }
    if (tool === 'robot') void send({ type: 'PLACE_ROBOT', position: p });
    else {
      const values = tool === 'obstacle' ? floorState.obstacles : floorState.chargers;
      void send({ type: tool === 'obstacle' ? 'SET_OBSTACLE' : 'SET_CHARGER', position: p, enabled: !values.some(value => same(value, p)) });
    }
  }
  function keyboard(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable="true"]') || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key.toLowerCase() === 'c') { event.preventDefault(); cursorMode = !cursorMode; return; }
    if (event.key === 'Escape') { cursorMode = false; pickTarget = false; return; }
    if (cursorMode || !selected || !target.closest('.floor-section, .inspector, .command-tray')) return;
    const commands = { ArrowUp: 'MOVE', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT' } as const;
    const type = commands[event.key as keyof typeof commands];
    if (type) { event.preventDefault(); enqueue({ type }); }
  }
  async function resize() {
    if (!editable || lifecycle !== 'SETTING_UP') return;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width! < 1 || width! > 20 || height! < 1 || height! > 20) { localError = 'Enter whole floor dimensions from 1 to 20.'; return; }
    await send({ type: 'RESIZE', width: width!, height: height! });
  }
  function play() { if (available && lifecycle === 'PAUSED') { if (intervalValid) void send({ type: 'PLAY', tickIntervalMs: interval! }); else localError = 'Enter a whole number from 100 to 5000 ms.'; } }
</script>
<!-- Keyboard handling is scoped to the labelled simulator; focus remains on native controls/grid. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<main class="workbench" onkeydown={keyboard} aria-label="Fleet Floor Simulator">
  <header class="world-header">
    <div><h1>Fleet Floor Simulator</h1><div class="world-id mono small" title={world.worldId}>World {world.worldId}</div></div>
    <ol class="lifecycle-track" aria-label="World lifecycle">{#each Object.entries(lifecycleNames) as [key, name]}<li class:active={key === lifecycle} class:last-known={key === lifecycle && view.connection !== 'live'} aria-current={key === lifecycle ? 'step' : undefined}>{name}</li>{/each}</ol>
    <strong class="tick mono">Tick {floorState.tick}</strong><span class="connection" class:live={view.connection === 'live'}>{view.connection === 'live' ? '✓ Live' : view.connection === 'connecting' ? 'Connecting' : '↻ Reconnecting'}</span>
    <p class="permission"><b>{view.connection !== 'live' ? 'Last known: ' : ''}{lifecycleNames[lifecycle]}:</b> {permissions[lifecycle]}</p>
  </header>
  {#if view.connection !== 'live'}<div class="banner disconnected" role="status">Reconnecting. Showing the last state received at tick {floorState.tick}.</div>{/if}
  {#if view.stopped}<div class="banner error-banner" role="alert"><strong>Playback stopped due to an error.</strong> Press Pause, then Play to continue.</div>{/if}
  {#if view.error || localError}<div class="banner error-banner" role="status">{view.error || localError}</div>{/if}
  {#if recovery?.action.type === 'PAUSE' && 'reason' in recovery.action && lifecycle === 'PAUSED'}<div class="banner info-banner">{recovery.action.reason === 'SERVER_RESTART' ? `The server restarted and paused this world at tick ${floorState.tick}. Press Play to resume.` : `Playback paused while no tabs were connected. Nothing ran after tick ${floorState.tick}. Press Play to resume.`}</div>{/if}
  <div class="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>
  <p id="control-reason" class="sr-only">{reason}</p>
  <div class="workbench-columns">
    <section class="floor-column" aria-label="Floor and playback">
      <div class="playback bar" aria-label="Playback controls">
        {#if lifecycle === 'SETTING_UP'}
          <div class="dimensions"><label>Width <input type="number" min="1" max="20" step="1" bind:value={width} aria-disabled={!editable} readonly={!editable}></label><label>Height <input type="number" min="1" max="20" step="1" bind:value={height} aria-disabled={!editable} readonly={!editable}></label><button aria-disabled={!editable} aria-describedby="control-reason" onclick={resize}>Apply size</button></div>
          <span class="hint">Current floor: {floorState.width} × {floorState.height}. 1 to 20. Resizing never clips content.</span>
          <button aria-disabled={!available} aria-describedby="control-reason" onclick={() => available && send({ type: 'CANCEL' })}>{delayedPending === 'CANCEL' ? 'Cancelling…' : 'Cancel'}</button>
          <button class="primary" aria-disabled={!available} aria-describedby="control-reason" onclick={() => available && send({ type: 'FINISH_SETUP' })}>{delayedPending === 'FINISH_SETUP' ? 'Finishing…' : 'Finish Setup'}</button>
        {:else if lifecycle === 'ENDED'}<span class="final-tag">Read-only final state at tick {floorState.tick}</span><button onclick={createAnother}>Create another world</button>
        {:else}
          {#if lifecycle === 'PLAYING'}<button class="primary" aria-disabled={!available} aria-describedby="control-reason" onclick={() => available && send({ type: 'PAUSE' })}>{delayedPending === 'PAUSE' ? 'Pausing…' : 'Pause'}</button>
          {:else}<button class="primary" aria-disabled={!available} aria-describedby="control-reason" onclick={play}>{delayedPending === 'PLAY' ? 'Starting…' : 'Play'}</button>{/if}
          <button aria-disabled={!available || lifecycle !== 'PAUSED'} aria-describedby="control-reason" onclick={() => available && lifecycle === 'PAUSED' && send({ type: 'STEP' })}>{delayedPending === 'STEP' ? 'Stepping…' : 'Step'}</button>
          <button aria-disabled={!available} aria-describedby="control-reason" onclick={() => available && send({ type: 'END' })}>{delayedPending === 'END' ? 'Ending…' : 'End'}</button>
        {/if}
      </div>
      {#if lifecycle !== 'ENDED'}<div class="speed-controls">
        <label for="interval">Next Play interval</label><div class="bar"><div class="speed-presets" role="group" aria-label="Interval presets">{#each [100, 250, 500, 1000, 2000, 5000] as value}<button aria-pressed={interval === value} aria-disabled={!editable} aria-describedby="control-reason" onclick={() => { if (editable) interval = value; }}>{value}</button>{/each}</div><input id="interval" type="number" min="100" max="5000" step="1" bind:value={interval} aria-invalid={!intervalValid} aria-disabled={!editable} readonly={!editable}><span class="small">ms</span>
          {#if lifecycle === 'PLAYING'}<strong class="running-interval">{world.runningTickIntervalMs ? `Running at ${world.runningTickIntervalMs} ms` : 'Scheduling stopped'}</strong>{/if}
        </div>{#if !intervalValid}<p class="error-text small">Enter a whole number from 100 to 5000 ms.</p>{/if}
      </div>{/if}
      <div class="tools bar" role="group" aria-label="Floor tools"><span class="small">Click tool</span>{#each [['robot', '+ Place robot'], ['obstacle', '▧ Obstacle'], ['charger', 'ϟ Charger']] as item}<button aria-pressed={tool === item[0]} aria-disabled={!editable} aria-describedby="control-reason" onclick={() => { if (editable) { tool = item[0]!; pickTarget = false; } }}>{item[1]}</button>{/each}</div>
      <p class="hint">{pickTarget ? `Pick a GOTO target for ${selectedId}. In-bounds blocked targets are allowed.` : editable ? tool === 'robot' ? 'Click an empty cell to place a North-facing robot, or a robot to select it.' : `Click to add or remove a ${tool}.` : reason}</p>
      <Floor {world} previous={view.previous} {selectedId} {tool} {editable} {pendingPosition} {rejectedPosition} adjacent={view.adjacent} {reduced} stale={view.connection !== 'live'} {cursorMode} {lastOutcomes} oncell={cell} oncursor={mode => cursorMode = mode}/>
      {#if lifecycle === 'SETTING_UP'}<ol class="learning-ribbon"><li><b>Queue</b> commands. Nothing moves yet.</li><li><b>Tick</b> runs one command per robot, simultaneously.</li><li><b>Read</b> the result and why a robot stayed.</li></ol>{/if}
    </section>
    <section class="panel inspector" aria-label="Selected robot">
      <div class="panel-heading"><h2>Selected robot{narrow && selected ? ` · ${selected.id}` : ''}</h2>{#if narrow}<button aria-expanded={inspectorOpen} onclick={() => inspectorOpen = !inspectorOpen}>{inspectorOpen ? 'Collapse details' : 'Inspect robot'}</button>{/if}</div>
      {#if inspectorOpen}
      {#if selected}
        <div class="inspector-heading"><div class="inspector-marker"><Marker robot={selected} selected/></div><div><h3>{selected.id}</h3><p class="mono small">at ({selected.position.x},{selected.position.y}) · facing {facingName(selected.facing)}</p><Battery value={selected.battery} {reduced} animate={view.adjacent && (world.runningTickIntervalMs ?? 1000) >= 500}/></div></div>
        {#if lifecycle === 'SETTING_UP'}
          <div class="bar" role="group" aria-label="Setup facing direction">
            {#each facings as facing}<button aria-pressed={selected.facing === facing} aria-disabled={!setupEditable} aria-describedby="control-reason" onclick={() => setupEditable && selected && send({ type: 'SET_ROBOT_FACING', robotId: selected.id, facing })}>Face {facingName(facing)}</button>{/each}
          </div>
          <p class="hint">Set facing immediately. Queued commands stay in order.</p>
          <button aria-disabled={!setupEditable} aria-describedby="control-reason" onclick={() => setupEditable && selected && send({ type: 'REMOVE_ROBOT', robotId: selected.id })}>{delayedPending === 'REMOVE_ROBOT' ? 'Deleting…' : 'Delete robot'}</button>
          <p class="hint">Deleting this robot also removes its queue.</p>
          {#if delayedPending === 'SET_ROBOT_FACING'}<p class="hint" role="status">Saving facing direction…</p>{/if}
        {/if}
        <div class="panel-heading"><h3>Queue, in run order ({selected.queue.length})</h3><button aria-disabled={!editable || !selected.queue.length} aria-describedby="control-reason" onclick={() => editable && selected && selected.queue.length && send({ type: 'CLEAR_QUEUE', robotId: selected.id })}>Clear Queue</button></div>
        <Queue queue={selected.queue} {reduced} animate={editable}/>{#if delayedPending === 'ENQUEUE_COMMANDS' || delayedPending === 'CLEAR_QUEUE'}<p class="hint" role="status">Saving queue change…</p>{/if}
        <p class="hint">Forward means MOVE in the way {selected.id} faces when the command runs. Now facing {facingName(selected.facing)}.</p>
        {#if !narrow}<div class="command-tray"><div class="command-buttons"><button aria-disabled={!editable} aria-describedby="control-reason" onclick={() => enqueue({ type: 'MOVE' })}>↑ Forward</button><button aria-disabled={!editable} aria-describedby="control-reason" onclick={() => enqueue({ type: 'LEFT' })}>← Left</button><button aria-disabled={!editable} aria-describedby="control-reason" onclick={() => enqueue({ type: 'RIGHT' })}>Right →</button></div></div>{/if}
        <div class="goto-form"><label>Go to x <input type="number" min="0" max={floorState.width - 1} step="1" bind:value={targetX} aria-disabled={!editable} readonly={!editable}></label><label>Go to y <input type="number" min="0" max={floorState.height - 1} step="1" bind:value={targetY} aria-disabled={!editable} readonly={!editable}></label><button aria-disabled={!editable} aria-describedby="control-reason" onclick={() => goto({ x: targetX ?? NaN, y: targetY ?? NaN })}>Queue GOTO</button><button aria-pressed={pickTarget} aria-disabled={!editable} aria-describedby="control-reason" onclick={() => { if (editable) { pickTarget = !pickTarget; cursorMode = true; } }}>Pick on floor</button></div>
        <p class="hint">Shift-click or Shift+Enter on a cell also queues GOTO. A target may wait up to three no-path ticks.</p>
        {#if !editable}<p class="reason">{reason}</p>{/if}
      {:else}<p class="muted">Click a robot on the floor or choose one from the list to inspect its queue and battery.</p>{/if}
      {/if}
    </section>
    <details class="panel robot-list-panel" bind:open={robotsOpen}><summary><h2>All robots ({floorState.robots.length})</h2></summary>
      <label class="small" for="robot-filter">Filter by ID</label><input id="robot-filter" bind:value={filter} placeholder="e.g. R2">
      <div class="robot-list">{#each filteredRobots as robot (robot.id)}<button class="robot-row" class:selected={robot.id === selectedId} aria-pressed={robot.id === selectedId} onclick={() => selectedId = robot.id}><span class="robot-line"><strong class="mono">{robot.id}</strong><span>{facingName(robot.facing)}</span><span class="mono">({robot.position.x},{robot.position.y})</span><Battery value={robot.battery}/></span><Queue queue={robot.queue} {reduced} animate={false}/></button>{:else}<p class="hint">{floorState.robots.length ? 'No matching robots.' : 'No robots placed yet.'}</p>{/each}</div>
    </details>
    <section class="panel last-tick" aria-label="Last tick"><h2>What happened on tick {lastTickEntry?.tick ?? floorState.tick}</h2>
      {#each lastOutcomes as outcome}<p class="outcome" class:blocked={outcome.movement.status === 'BLOCKED' || outcome.command.status === 'ABANDONED'}><span aria-hidden="true">{outcome.movement.status === 'BLOCKED' ? '!' : outcome.movement.status === 'SUCCEEDED' ? '✓' : '·'}</span><span>{outcomeText(outcome, (view.previous?.state.tick === (lastTickEntry?.tick ?? floorState.tick) - 1 ? view.previous : null)?.state.robots.find(r => r.id === outcome.robotId), floorState.robots.find(r => r.id === outcome.robotId), world)}</span></p>{:else}<p class="muted">{floorState.tick === 0 ? 'No ticks have run yet. Finish setup, then Step to see each robot’s result.' : 'Loading the last committed tick…'}</p>{/each}
    </section>
    <History {narrow} {reduced} animate={view.adjacent && (world.runningTickIntervalMs ?? 1000) >= 500} entries={view.history} error={view.historyError} cursor={view.historyCursor} revision={world.revision} retry={retryHistory}/>
  </div>
  {#if narrow && selected}<div class="command-tray" aria-label="Commands for {selected.id}"><div class="tray-label small"><b>{selected.id}</b> · {facingName(selected.facing)} · {selected.queue.length} queued</div><div class="command-buttons"><button aria-disabled={!editable} aria-describedby="control-reason" onclick={() => enqueue({ type: 'MOVE' })}>↑ Forward</button><button aria-disabled={!editable} aria-describedby="control-reason" onclick={() => enqueue({ type: 'LEFT' })}>← Left</button><button aria-disabled={!editable} aria-describedby="control-reason" onclick={() => enqueue({ type: 'RIGHT' })}>Right →</button><button aria-disabled={!editable} aria-describedby="control-reason" onclick={() => { if (editable) { inspectorOpen = true; document.querySelector('.inspector')?.scrollIntoView({ block: 'center' }); } }}>Go to…</button></div></div>{/if}
</main>
