import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { ApiError } from '../../common/http/api-error.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { readSessionCookie } from './session-cookie.js';
import { SessionService } from './session.service.js';

/**
 * Global, default-deny guard: every route requires a valid session unless it is marked
 * `@Public()`. Every failure cause (no cookie, malformed, unknown, expired, signed out)
 * produces the same 401.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const token = readSessionCookie(request);
    const user = token ? await this.sessions.validate(token) : null;

    if (!user) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required');
    }

    request.authUser = user;
    return true;
  }
}
