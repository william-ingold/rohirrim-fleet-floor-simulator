<script lang="ts">
  let { value, reduced = false, animate = false }: { value: number; reduced?: boolean; animate?: boolean } = $props();
</script>
<span class="battery" class:empty={value === 0} aria-label="Battery {value} percent">
  <span class="battery-track" aria-hidden="true"><span style:width="{value}%" style:transition={animate && !reduced ? 'width 120ms linear' : 'none'}></span></span>
  <span class="mono">{value}%</span>{#if value === 0}<small>empty</small>{/if}
</span>
