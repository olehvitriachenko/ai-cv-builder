import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply } from 'fastify';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe.js';
import { registerSchema, type RegisterInput } from './auth.schemas.js';
import type { AuthUser } from './auth.types.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './current-user.decorator.js';
import { Public } from './public.decorator.js';
import { setSessionCookie } from './session-cookie.js';

@Controller('auth')
export class AuthController {
  /** Read once from validated config: cookies are `Secure` only in production. */
  private readonly secureCookies: boolean;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService,
  ) {
    this.secureCookies = config.getOrThrow<string>('NODE_ENV') === 'production';
  }

  @Public()
  @Post('register')
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthUser> {
    const { user, token, expiresAt } = await this.auth.register(body);

    setSessionCookie(reply, token, expiresAt, this.secureCookies);
    return user;
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): AuthUser {
    return { id: user.id, email: user.email };
  }
}
