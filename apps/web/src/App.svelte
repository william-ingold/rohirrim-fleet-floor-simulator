<script lang="ts">
  import { onMount } from 'svelte';
  import { createTransport } from './lib/client.js';
  import { message, Session } from './lib/session.js';
  import Workbench from './components/Workbench.svelte';
  const transport = createTransport(); const session = new Session(transport);
  let worldId = $state(''); let creating = $state(false); let notice = $state(''); let error = $state('');
  let width = $state<number | undefined>(10); let height = $state<number | undefined>(8);
  let mounted = $state(false);
  function navigate(id: string, replace = false) {
    const url = new URL(location.href);
    if (id) url.searchParams.set('world', id); else url.searchParams.delete('world');
    history[replace ? 'replaceState' : 'pushState']({}, '', url);
    open(id);
  }
  function open(id: string) { worldId = id; error = ''; if (id) session.open(id); else session.dispose(); }
  onMount(() => {
    mounted = true;
    open(new URL(location.href).searchParams.get('world') ?? '');
    const pop = () => open(new URL(location.href).searchParams.get('world') ?? '');
    const leave = () => session.dispose();
    const restore = (event: PageTransitionEvent) => { if (event.persisted && worldId) session.open(worldId); };
    window.addEventListener('popstate', pop); window.addEventListener('pagehide', leave); window.addEventListener('pageshow', restore);
    return () => { session.dispose(); window.removeEventListener('popstate', pop); window.removeEventListener('pagehide', leave); window.removeEventListener('pageshow', restore); };
  });
  $effect(() => { if (mounted && worldId && $session.missing) { notice = $session.error; navigate('', true); } });
  async function create() {
    if (creating) return;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width! < 1 || width! > 20 || height! < 1 || height! > 20) { error = 'Enter whole floor dimensions from 1 to 20.'; return; }
    creating = true; error = ''; notice = '';
    try { const world = await transport.create(width!, height!); navigate(world.worldId); }
    catch (cause) { error = message(cause); }
    finally { creating = false; }
  }
</script>
{#if worldId && $session.world}
  {#key worldId}<Workbench view={$session} act={action => session.act(action)} createAnother={() => { notice = ''; navigate(''); }} retryHistory={() => void session.catchUpHistory()}/>{/key}
{:else if worldId}
  <main class="loading panel"><h1>Fleet Floor Simulator</h1><p role="status">Connecting to the simulator…</p>{#if $session.error}<p class="error-text" role="alert">{$session.error}</p><button onclick={() => session.open(worldId)}>Retry connection</button>{/if}<button onclick={() => navigate('')}>Create another world</button></main>
{:else}
  <main class="creation panel"><p class="eyebrow">Build · Queue · Observe</p><h1>Fleet Floor Simulator</h1><p>Place robots and features on a floor, queue their commands, and explore what happens one tick at a time.</p>
    {#if notice}<p class="banner info-banner" role="status">{notice}</p>{/if}
    {#if error}<p class="error-text" role="alert">{error}</p>{/if}
    <form onsubmit={event => { event.preventDefault(); void create(); }}><div class="dimensions"><label>Width <input type="number" min="1" max="20" step="1" bind:value={width} required readonly={creating}></label><label>Height <input type="number" min="1" max="20" step="1" bind:value={height} required readonly={creating}></label></div><p class="hint">1 to 20 cells in each direction. You can adjust the size during setup.</p><button class="primary" type="submit" aria-disabled={creating}>{creating ? 'Creating…' : 'Create world'}</button></form>
    <p class="hint">Your world is saved by the server. Keep its URL to return to it.</p>
  </main>
{/if}
