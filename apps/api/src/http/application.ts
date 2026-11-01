import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { WorldService } from '../floors/world-service.js';
import { openDatabase } from '../persistence/database.js';
import { ApiErrorFilter } from './errors.js';
import { WorldsController } from './worlds-controller.js';

/** Recovery completes before the app can listen; the app owns this connection. */
export async function createApplication(databasePath: string): Promise<NestExpressApplication> {
  const db = openDatabase(databasePath);
  try {
    const worlds = new WorldService(db);
    @Module({
      controllers: [WorldsController],
      providers: [
        { provide: WorldService, useValue: worlds },
        { provide: 'DATABASE_LIFECYCLE', useValue: { onApplicationShutdown: () => { if (db.open) db.close(); } } },
      ],
    })
    class ApplicationModule {}
    const app = await NestFactory.create<NestExpressApplication>(ApplicationModule, { logger: false, bodyParser: false, abortOnError: false });
    // Queues have no domain length cap; do not impose Express's default 100KB cap.
    app.useBodyParser('json', { limit: Infinity });
    app.useGlobalFilters(new ApiErrorFilter(app.getHttpAdapter()));
    return app;
  } catch (error) { if (db.open) db.close(); throw error; }
}
