import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ApiError } from '../../common/http/api-error.js';
import type { AuthUser } from './auth.types.js';

/** The authenticated user, as set by the auth guard. The only source of caller identity. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const request = context.switchToHttp().getRequest<FastifyRequest>();

    if (!request.authUser) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required');
    }
    return request.authUser;
  },
);
