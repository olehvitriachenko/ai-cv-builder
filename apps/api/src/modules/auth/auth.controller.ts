import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe.js';
import {
  loginSchema,
  registerSchema,
  type LoginInput,
  type RegisterInput,
} from './auth.schemas.js';
import type { AuthUser } from './auth.types.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './current-user.decorator.js';
import { Public } from './public.decorator.js';
import { clearSessionCookie, readSessionCookie, setSessionCookie } from './session-cookie.js';

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

  @Public()
  @HttpCode(200)
  @Post('login')
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthUser> {
    const { user, token, expiresAt } = await this.auth.login(body);

    setSessionCookie(reply, token, expiresAt, this.secureCookies);
    return user;
  }

  @Public()
  @HttpCode(204)
  @Post('logout')
  async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    await this.auth.logout(readSessionCookie(request));
    clearSessionCookie(reply, this.secureCookies);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): AuthUser {
    return { id: user.id, email: user.email };
  }
}
