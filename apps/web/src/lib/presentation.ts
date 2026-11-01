import type { CommandSnapshot, HistoryEntry, Position, RobotSnapshot, RobotTickOutcome, WorldResponse } from './types.js';
export const same = (a: Position, b: Position) => a.x === b.x && a.y === b.y;
export const coordinate = (p: Position) => `(${p.x},${p.y})`;
export const facingName = (facing: string) => facing[0]! + facing.slice(1).toLowerCase();
export const commandName = (command: CommandSnapshot) => command.type === 'GOTO' ? `GOTO ${command.target.x},${command.target.y}${command.consecutiveNoPathTicks ? ` · no path ${command.consecutiveNoPathTicks} of 3` : ''}` : command.type;
export function historyName(entry: HistoryEntry): string {
  const a = entry.action;
  switch (a.type) {
    case 'CREATE': return `Created ${a.width} × ${a.height} world`;
    case 'PLACE_ROBOT': return `Placed ${entry.effects.robotId ?? a.robotId ?? 'robot'} at ${coordinate(a.position)}`;
    case 'SET_OBSTACLE': case 'SET_CHARGER': return `${a.enabled ? 'Added' : 'Removed'} ${a.type === 'SET_OBSTACLE' ? 'obstacle' : 'charger'} at ${coordinate(a.position)}`;
    case 'RESIZE': return `Resized floor to ${a.width} × ${a.height}`;
    case 'ENQUEUE_COMMANDS': return `Queued ${a.commands.map(c => c.type === 'GOTO' ? `GOTO ${coordinate(c.target)}` : c.type).join(', ')} for ${a.robotId}`;
    case 'CLEAR_QUEUE': return `Cleared ${a.robotId}'s queue`;
    case 'REMOVE_ROBOT': return `Deleted ${a.robotId} and its queue`;
    case 'SET_ROBOT_FACING': return `Set ${a.robotId} facing ${facingName(a.facing)}`;
    case 'FINISH_SETUP': return 'Finished setup; initial state saved';
    case 'PLAY': return `Play at ${a.tickIntervalMs} ms`;
    case 'PAUSE': return 'reason' in a ? a.reason === 'SERVER_RESTART' ? 'Paused after server restart' : 'Paused automatically: no browser tabs connected' : 'Paused';
    case 'END': return 'World ended';
    case 'STEP': case 'AUTOMATIC_TICK': {
      const outcomes = entry.effects.outcomes ?? [];
      return `Tick ${entry.tick}: ${outcomes.filter(o => o.movement.status === 'SUCCEEDED').length} moved, ${outcomes.filter(o => o.movement.status === 'BLOCKED').length} blocked`;
    }
    default: return 'World changed';
  }
}
export function outcomeText(outcome: RobotTickOutcome, before?: RobotSnapshot, after?: RobotSnapshot, world?: WorldResponse): string {
  const { robotId: id, movement: move, command, facing, position } = outcome;
  const messages: string[] = [];
  const turned = before ? before.facing !== facing : command.status === 'COMPLETED' && (command.type === 'LEFT' || command.type === 'RIGHT');
  if (turned) messages.push(`${id} turned to face ${facingName(facing)}.`);
  if (move.status === 'SUCCEEDED') messages.push(`${id} moved ${facing.toLowerCase()} to ${coordinate(position)}.`);
  if (move.status === 'BLOCKED') {
    const stayed = `Robot stayed at ${coordinate(position)}.`;
    const reason = {
      NO_BATTERY: `${id} has no battery. ${stayed}`,
      OUT_OF_BOUNDS: `${id} reached the floor edge. ${stayed}`,
      OBSTACLE: `${id} hit an obstacle. ${stayed}`,
      CONTESTED: `${id} was blocked: ${move.blockerId ?? 'another robot'} has the lower ID and aimed for the same cell.`,
      HEAD_ON_SWAP: `${id}${move.blockerId ? ` and ${move.blockerId}` : ''} can't swap cells head-on. Both stayed.`,
      OCCUPIED: `${id} was blocked: ${move.blockerId ?? 'another robot'} stayed in the next cell.`,
    };
    messages.push(reason[move.reason]);
  }
  const head = before?.queue[0], current = after?.queue[0];
  const target = head?.type === 'GOTO' ? ` ${coordinate(head.target)}` : current?.type === 'GOTO' ? ` ${coordinate(current.target)}` : '';
  if (command.status === 'ABANDONED') messages.push(`${id} gave up on GOTO${target}: no path for 3 ticks in a row. Marked UNREACHABLE.`);
  if (command.status === 'COMPLETED' && command.type === 'GOTO') messages.push(`${id} arrived at${target || ` ${coordinate(position)}`}. GOTO complete.`);
  if (command.status === 'CONTINUING' && move.status === 'NOT_ATTEMPTED') messages.push(`${id} found no path to${target || ' the target'}${current?.type === 'GOTO' ? `, try ${current.consecutiveNoPathTicks} of 3` : ''}. Facing unchanged.`);
  if (before && outcome.battery > before.battery - (move.status === 'SUCCEEDED' ? 1 : 0)) {
    messages.push(`${id} ended the tick on a charger: battery ${before.battery} to ${outcome.battery}${outcome.battery === 100 ? ', capped' : ''}.`);
  }
  return messages.join(' ') || `${id} stayed at ${coordinate(position)}, facing ${facingName(facing)}, battery ${outcome.battery}.`;
}
