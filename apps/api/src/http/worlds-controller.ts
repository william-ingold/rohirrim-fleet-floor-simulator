import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import { WorldService } from '../floors/world-service.js';
import type { CommittedWorld } from '../floors/types.js';
import { parseAction, parseCreate, parseHistory } from './validation.js';

export type WorldResponse = CommittedWorld & { readonly runningTickIntervalMs: number | null };
function envelope(world: CommittedWorld): WorldResponse {
  return { ...world, runningTickIntervalMs: null };
}
@Controller('api/worlds')
export class WorldsController {
  constructor(@Inject(WorldService) private readonly worlds: WorldService) {}
  @Post()
  create(@Body() body: unknown): WorldResponse {
    const input = parseCreate(body);
    return envelope(this.worlds.create(input.width, input.height));
  }
  @Get(':id')
  get(@Param('id') id: string): WorldResponse { return envelope(this.worlds.get(id)); }
  @Post(':id/actions')
  @HttpCode(200)
  act(@Param('id') id: string, @Body() body: unknown) {
    const result = this.worlds.act(id, parseAction(body));
    return 'cancelled' in result ? result : envelope(result);
  }
  @Get(':id/history')
  history(@Param('id') id: string, @Query() query: unknown) {
    return this.worlds.history(id, parseHistory(query));
  }
}
