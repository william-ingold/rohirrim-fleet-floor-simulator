import type { CommandInput, Facing, Position } from '@rohirrim/engine';

export type ScenarioAction =
  | { readonly type: 'FLOOR'; readonly width: number; readonly height: number }
  | { readonly type: 'OBSTACLE' | 'CHARGER'; readonly position: Position }
  | { readonly type: 'PLACE'; readonly robotId: string; readonly position: Position; readonly facing: Facing }
  | { readonly type: 'QUEUE'; readonly robotId: string; readonly commands: readonly CommandInput[] }
  | { readonly type: 'TICK'; readonly count: number }
  | { readonly type: 'REPORT'; readonly battery: boolean };

function integer(token: string): number | null {
  if (!/^[0-9]+$/.test(token)) return null;
  const value = Number(token);
  return Number.isSafeInteger(value) ? value : null;
}

function position(token: string | undefined): Position | null {
  const parts = token?.split(',');
  if (!parts || parts.length !== 2) return null;
  const x = integer(parts[0]!);
  const y = integer(parts[1]!);
  return x === null || y === null ? null : { x, y };
}

function robotId(token: string | undefined): string | null {
  if (!token?.startsWith('R')) return null;
  const value = integer(token.slice(1));
  return value !== null && value > 0 ? `R${value}` : null;
}

/** A complete syntactic action or no action; domain bounds are validated by World. */
export function parseLine(line: string): ScenarioAction | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const tokens = trimmed.toUpperCase().replace(/[ \t]*,[ \t]*/g, ',').split(/[ \t]+/);
  const [type, argument] = tokens;
  switch (type) {
    case 'FLOOR': {
      const dimensions = position(argument);
      return tokens.length === 2 && dimensions ? { type, width: dimensions.x, height: dimensions.y } : null;
    }
    case 'OBSTACLE':
    case 'CHARGER': {
      const cell = position(argument);
      return tokens.length === 2 && cell ? { type, position: cell } : null;
    }
    case 'PLACE': {
      const id = robotId(argument);
      const parts = tokens[2]?.split(',');
      if (tokens.length !== 3 || !id || parts?.length !== 3) return null;
      const cell = position(`${parts[0]},${parts[1]}`);
      const facing = parts[2];
      if (!cell || (facing !== 'NORTH' && facing !== 'EAST' && facing !== 'SOUTH' && facing !== 'WEST')) return null;
      return { type, robotId: id, position: cell, facing };
    }
    case 'QUEUE': {
      const id = robotId(argument);
      if (!id || tokens.length < 3) return null;
      const commands: CommandInput[] = [];
      for (let i = 2; i < tokens.length; i++) {
        const command = tokens[i];
        if (command === 'MOVE' || command === 'LEFT' || command === 'RIGHT') commands.push({ type: command });
        else if (command === 'GOTO') {
          const target = position(tokens[++i]);
          if (!target) return null;
          commands.push({ type: command, target });
        } else return null;
      }
      return { type, robotId: id, commands };
    }
    case 'TICK': {
      const count = argument === undefined ? 1 : integer(argument);
      return tokens.length <= 2 && count !== null && count > 0 ? { type, count } : null;
    }
    case 'REPORT':
      return tokens.length === 1 || (tokens.length === 2 && argument === 'BATTERY')
        ? { type, battery: argument === 'BATTERY' } : null;
    default: return null;
  }
}
