<script lang="ts">
  import type { HistoryEntry } from '../lib/types.js';
  import { historyName, outcomeText, facingName } from '../lib/presentation.js';
  let { entries, error, cursor, revision, retry, narrow = false, reduced = false, animate = false }: { narrow?: boolean; reduced?: boolean; animate?: boolean; entries: readonly HistoryEntry[]; error: string; cursor: number; revision: number; retry: () => void } = $props();
  let panel = $state<HTMLDivElement>(); let expanded = $state(true);
  $effect(() => { expanded = !narrow; }); let atBottom = $state(true); let filter = $state('');
  let visible = $derived(entries.filter(e => !filter || historyName(e).toLowerCase().includes(filter.toLowerCase()) || e.effects.outcomes?.some(o => o.robotId.toLowerCase().includes(filter.toLowerCase()))));
  let lastSeen = $state(0);
  function onscroll() {
    if (!panel) return;
    atBottom = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 16;
    if (atBottom) lastSeen = entries.at(-1)?.revision ?? 0;
  }
  function latest() { if (!panel) return; panel.scrollTop = panel.scrollHeight; atBottom = true; lastSeen = entries.at(-1)?.revision ?? 0; }
</script>
<section class="panel history-panel" class:collapsed={!expanded} aria-label="History">
  <div class="panel-heading"><h2>History</h2><span class="hint">oldest to newest</span>{#if narrow}<button aria-expanded={expanded} onclick={() => expanded = !expanded}>{expanded ? 'Collapse history' : 'Expand history'}</button>{/if}</div>
  {#if expanded}
  <label class="small" for="history-filter">Filter history by ID or action</label><input id="history-filter" bind:value={filter} placeholder="e.g. R2 or paused">
  {#if error}<p role="status" class="error-text">{error}</p><button onclick={retry}>Retry history</button>{/if}
  {#if cursor < revision}<p class="hint">Loading history after r{cursor}…</p>{/if}
  <!-- A focusable scroll region supports keyboard scrolling without focusing every row. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="history-rows" bind:this={panel} {onscroll} tabindex="0" role="region" aria-label="Committed history entries">
    {#each visible as entry (entry.revision)}
      <details class="history-row" class:new-entry={animate && !reduced && entry.revision === revision}>
        <summary><span class="mono muted">r{entry.revision}<br>t{entry.tick}</span><span>{historyName(entry)}</span></summary>
        <div class="history-detail"><time datetime={entry.timestamp}>{new Date(entry.timestamp).toLocaleString()}</time>
          {#each entry.effects.outcomes ?? [] as outcome}<p>{outcomeText(outcome)}<span class="history-result mono">Result: ({outcome.position.x},{outcome.position.y}) · {facingName(outcome.facing)} · battery {outcome.battery}%<br>{outcome.command.status === 'NONE' ? 'No command' : `${outcome.command.type} ${outcome.command.status.toLowerCase()}`}</span></p>{/each}
        </div>
      </details>
    {:else}<p class="hint">{filter ? 'No matching history.' : 'No history received yet.'}</p>{/each}
  </div>
  {#if entries.length && (!atBottom || (entries.at(-1)?.revision ?? 0) > lastSeen)}<button class="jump-latest" onclick={latest}>Jump to latest ↓</button>{/if}
  {/if}
</section>
