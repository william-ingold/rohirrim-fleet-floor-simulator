<script lang="ts">
  import type { RobotSnapshot } from '../lib/types.js';
  let { robot, previous, selected = false, stale = false, adjacent = false, reduced = false, interval = 1000, cell = 54 }: {
    robot: RobotSnapshot; previous?: RobotSnapshot | undefined; selected?: boolean; stale?: boolean;
    adjacent?: boolean; reduced?: boolean; interval?: number; cell?: number;
  } = $props();
  const angles = { NORTH: 0, EAST: 90, SOUTH: 180, WEST: 270 };
  let marker: HTMLSpanElement; let shape: SVGSVGElement;
  $effect(() => {
    const current = robot, before = previous;
    if (!marker || !shape || !adjacent || reduced || interval < 250 || !before) return;
    const moved = current.position.x !== before.position.x || current.position.y !== before.position.y;
    const turned = current.facing !== before.facing;
    const full = interval >= 500;
    let delta = (angles[current.facing] - angles[before.facing] + 360) % 360;
    if (delta === 270) delta = -90;
    const animations: Animation[] = [];
    if (turned && shape.animate) animations.push(shape.animate([
      { transform: `rotate(${angles[current.facing] - delta}deg)` }, { transform: `rotate(${angles[current.facing]}deg)` },
    ], { duration: full ? (moved ? 100 : 160) : (moved ? 120 : 80), easing: 'ease-in-out' }));
    if (moved && marker.animate) animations.push(marker.animate([
      { transform: `translate(${(before.position.x - current.position.x) * cell}px, ${(current.position.y - before.position.y) * cell}px)` }, { transform: 'translate(0,0)' },
    ], { duration: full ? (turned ? 180 : 240) : 120, delay: full && turned ? 100 : 0, fill: 'backwards', easing: 'ease-out' }));
    return () => animations.forEach(animation => animation.cancel());
  });
</script>
<span bind:this={marker} class="robot-marker" class:selected class:stale aria-hidden="true">
  <svg bind:this={shape} viewBox="-10 -10 120 120" style:transform="rotate({angles[robot.facing]}deg)">
    {#if selected}<path class="marker-ring" d="M50 4 L94 44 V88 Q94 94 88 94 H12 Q6 94 6 88 V44 Z"/><path class="marker-gap" d="M50 4 L94 44 V88 Q94 94 88 94 H12 Q6 94 6 88 V44 Z"/>{/if}
    <path class="marker-body" d="M50 4 L94 44 V88 Q94 94 88 94 H12 Q6 94 6 88 V44 Z"/>
    <path class="marker-arrow" d="M50 15 L63 29 H37 Z"/>
  </svg>
  <b>{cell < 40 ? robot.id.slice(1) : robot.id}</b>
</span>
