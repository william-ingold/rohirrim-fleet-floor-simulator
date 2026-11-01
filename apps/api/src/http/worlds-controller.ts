import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Res } from '@nestjs/common';
import type { ServerResponse } from 'node:http';
import { CommittedActions } from '../floors/committed-actions.js';
import { WorldService } from '../floors/world-service.js';
import type { CommittedWorld } from '../floors/types.js';
import { parseAction, parseCreate, parseHistory, parsePresence } from './validation.js';
import { Playback } from '../playback/playback.js';
import { Streams } from '../streaming/streams.js';

export type WorldResponse = CommittedWorld & { readonly runningTickIntervalMs: number | null };
@Controller('api/worlds')
export class WorldsController {
  constructor(@Inject(WorldService) private readonly worlds: WorldService, @Inject(CommittedActions) private readonly actions: CommittedActions,
    @Inject(Playback) private readonly playback: Playback, @Inject(Streams) private readonly streams: Streams) {}
  @Post()
  create(@Body() body: unknown): WorldResponse {
    const input = parseCreate(body);
    return this.playback.envelope(this.actions.create(input.width, input.height));
  }
  @Get(':id')
  get(@Param('id') id: string): WorldResponse { return this.playback.envelope(this.worlds.get(id)); }
  @Post(':id/actions')
  @HttpCode(200)
  act(@Param('id') id: string, @Body() body: unknown) {
    const result = this.playback.act(id, parseAction(body));
    return 'cancelled' in result ? result : this.playback.envelope(result);
  }
  @Get(':id/history')
  history(@Param('id') id: string, @Query() query: unknown) {
    return this.worlds.history(id, parseHistory(query));
  }
  @Get(':id/events')
  events(@Param('id') id: string, @Res() response: ServerResponse): void { this.streams.open(id, response); }
  @Post(':id/presence')
  @HttpCode(200)
  presence(@Param('id') id: string, @Body() body: unknown) { return this.playback.renew(id, parsePresence(body)); }
}
