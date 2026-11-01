import { Catch, HttpException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter, HttpServer } from '@nestjs/common';
import { DomainError } from '@rohirrim/engine';
import { StorageError } from '../floors/world-service.js';

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  constructor(private readonly adapter: Pick<HttpServer, 'reply'>) {}
  catch(error: unknown, host: ArgumentsHost): void {
    let status = 500, code = 'INTERNAL_ERROR', message = 'An internal error occurred';
    if (error instanceof DomainError) {
      code = error.code; message = error.message;
      status = code === 'INVALID_LIFECYCLE' ? 409 : code === 'INVALID_PLACEMENT' ? 422 : 400;
    } else if (error instanceof StorageError) {
      code = error.code;
      status = code === 'WORLD_NOT_FOUND' ? 404 : 500;
      if (status === 404) message = 'World not found';
      else if (code === 'UNSUPPORTED_SNAPSHOT_VERSION') message = 'Unsupported saved snapshot version';
    } else if (error !== null && typeof error === 'object' && 'code' in error &&
      typeof error.code === 'string' && /^(SQLITE_BUSY|SQLITE_LOCKED)(_|$)/.test(error.code)) {
      status = 503; code = 'PERSISTENCE_UNAVAILABLE'; message = 'Persistence is temporarily unavailable';
    } else if (error instanceof HttpException) {
      status = error.getStatus();
      code = status === 404 ? 'WORLD_NOT_FOUND' : status < 500 ? 'INVALID_REQUEST' : 'INTERNAL_ERROR';
      message = status === 404 ? 'Route not found' : status < 500 ? 'Invalid request' : message;
    }
    this.adapter.reply(host.switchToHttp().getResponse<unknown>(), { error: { code, message } }, status);
  }
}
