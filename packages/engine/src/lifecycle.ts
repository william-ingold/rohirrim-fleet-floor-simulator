import { DomainError } from './types.js';
import type { Lifecycle } from './types.js';

type Transition = 'FINISH_SETUP' | 'PLAY' | 'PAUSE' | 'END';
const transitions: Record<Lifecycle, Partial<Record<Transition, Lifecycle>>> = {
  SETTING_UP: { FINISH_SETUP: 'PAUSED' },
  PAUSED: { PLAY: 'PLAYING', PAUSE: 'PAUSED', END: 'ENDED' },
  PLAYING: { PLAY: 'PLAYING', PAUSE: 'PAUSED', END: 'ENDED' },
  ENDED: { END: 'ENDED' },
};
export function transition(from: Lifecycle, action: Transition): Lifecycle {
  const next = transitions[from][action];
  if (!next) throw new DomainError(`${action} is not allowed while ${from}`, 'INVALID_LIFECYCLE');
  return next;
}
export function guard(lifecycle: Lifecycle, allowed: readonly Lifecycle[]): void {
  if (!allowed.includes(lifecycle)) throw new DomainError(`Action is not allowed while ${lifecycle}`, 'INVALID_LIFECYCLE');
}
