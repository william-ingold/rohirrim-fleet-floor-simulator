import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { DomainError } from '@rohirrim/engine';

/** Reject bodies the configured JSON parser would otherwise silently ignore. */
export class JsonRequestGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      method: string; headers: Record<string, string | string[] | undefined>;
    }>();
    if (request.method !== 'POST') return true;
    const headers = request.headers, type = headers['content-type'];
    const hasBody = headers['transfer-encoding'] !== undefined || (headers['content-length'] !== undefined && headers['content-length'] !== '0');
    if (type !== undefined || hasBody) {
      if (typeof type !== 'string' || type.split(';')[0]!.trim().toLowerCase() !== 'application/json') throw new DomainError('Expected application/json');
    }
    return true;
  }
}
