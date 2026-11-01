import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { CommittedActions, CommittedUpdates } from '../floors/committed-actions.js';
import { WorldService } from '../floors/world-service.js';
import { openDatabase } from '../persistence/database.js';
import { JsonRequestGuard } from './json-request-guard.js';
import { ApiErrorFilter } from './errors.js';
import { WorldsController } from './worlds-controller.js';
import { Playback } from '../playback/playback.js';
import type { Clock } from '../playback/playback.js';
import { Streams } from '../streaming/streams.js';

/** Recovery completes before the app can listen; the app owns this connection. */
export async function createApplication(databasePath: string, options: { onDeliveryError?: (error: unknown) => void; clock?: Clock } = {}): Promise<NestExpressApplication> {
  const db = openDatabase(databasePath);
  try {
    const worlds = new WorldService(db);
    const updates = new CommittedUpdates(options.onDeliveryError);
    const actions = new CommittedActions(worlds, updates);
    const playback = new Playback(worlds, actions, options.clock);
    const streams = new Streams(worlds, updates, playback);
    @Module({
      controllers: [WorldsController],
      providers: [
        { provide: WorldService, useValue: worlds },
        { provide: CommittedUpdates, useValue: updates },
        { provide: CommittedActions, useValue: actions },
        { provide: Playback, useValue: playback },
        { provide: Streams, useValue: streams },
        { provide: 'DATABASE_LIFECYCLE', useValue: { onModuleDestroy: () => playback.close(), onApplicationShutdown: () => { if (db.open) db.close(); } } },
      ],
    })
    class ApplicationModule {}
    const app = await NestFactory.create<NestExpressApplication>(ApplicationModule, { logger: false, bodyParser: false, abortOnError: false });
    // Queues have no domain length cap; do not impose Express's default 100KB cap.
    app.useBodyParser('json', { limit: Infinity });
    app.useGlobalFilters(new ApiErrorFilter(app.getHttpAdapter()));
    app.useGlobalGuards(new JsonRequestGuard());
    return app;
  } catch (error) { if (db.open) db.close(); throw error; }
}
