import type { WorldSnapshot } from '@rohirrim/engine';

export function report(state: WorldSnapshot, battery: boolean): string {
  const robots = [...state.robots].sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
  if (robots.length === 0) return 'EMPTY\n';
  return robots.map(robot => battery
    ? `${robot.id} ${robot.battery}\n`
    : `${robot.id} ${robot.position.x},${robot.position.y},${robot.facing}\n`).join('');
}
