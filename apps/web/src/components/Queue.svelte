<script lang="ts">
  import { fade } from 'svelte/transition';
  import type { CommandSnapshot } from '../lib/types.js';
  import { commandName } from '../lib/presentation.js';
  let { queue, reduced = false, animate = true }: { queue: readonly CommandSnapshot[]; reduced?: boolean; animate?: boolean } = $props();
</script>
<span class="queue" role="list" aria-label="Commands in run order">
  {#each queue as command, index (index)}<span role="listitem" in:fade={{ duration: reduced || !animate ? 0 : 120 }} out:fade={{ duration: reduced || !animate ? 0 : 80 }} class="queue-chip" class:head={index === 0} class:waiting={command.type === 'GOTO' && command.consecutiveNoPathTicks > 0}><span class="sr-only">{index + 1}. </span><span>{commandName(command)}</span></span>{:else}<span class="muted">No commands</span>{/each}
</span>
