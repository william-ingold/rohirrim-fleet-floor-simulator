import { DomainError, World } from '@rohirrim/engine';
import { parseLine } from './parser.js';
import type { ScenarioAction } from './parser.js';
import { report } from './reporter.js';

export type ScenarioResult = { readonly world: World; readonly stdout: string };

function finishSetup(world: World): World {
  return world.snapshot.lifecycle === 'SETTING_UP' ? world.finishSetup() : world;
}

function apply(world: World, action: Exclude<ScenarioAction, { type: 'REPORT' }>): World {
  switch (action.type) {
    case 'FLOOR': return world.snapshot.lifecycle === 'SETTING_UP' ? World.create(action.width, action.height) : world;
    case 'PLACE': return world.placeRobot(action.position, action.robotId, action.facing);
    case 'OBSTACLE': return world.setObstacle(action.position, true);
    case 'CHARGER': return world.setCharger(action.position, true);
    case 'QUEUE': return world.enqueue(action.robotId, action.commands);
    case 'TICK': {
      let next = finishSetup(world);
      for (let i = 0; i < action.count; i++) next = next.step().world;
      return next;
    }
  }
}

export function runScenario(input: string): ScenarioResult {
  let world = World.create(5, 5);
  const output: string[] = [];
  for (const line of input.split(/\r?\n/)) {
    const action = parseLine(line);
    if (!action) continue;
    if (action.type === 'REPORT') output.push(report(world.snapshot, action.battery));
    else {
      try { world = apply(world, action); }
      catch (error) { if (!(error instanceof DomainError)) throw error; }
    }
  }
  return { world: finishSetup(world).end(), stdout: output.join('') };
}
