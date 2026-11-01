<script lang="ts">
  import type { CommandSnapshot } from '../lib/types.js';
  import { commandName } from '../lib/presentation.js';
  let { queue }: { queue: readonly CommandSnapshot[] } = $props();
</script>
<div class="queue" aria-label="Commands in run order">
  {#each queue as command, index}<span class="queue-chip" class:head={index === 0} class:waiting={command.type === 'GOTO' && command.consecutiveNoPathTicks > 0}><span class="sr-only">{index + 1}. </span>{commandName(command)}</span>{:else}<span class="muted">No commands</span>{/each}
</div>
