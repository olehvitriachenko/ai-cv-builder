import { Injectable, Logger } from '@nestjs/common';
import { ApiError } from '../../common/http/api-error.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/index.js';
import type { LoginInput, RegisterInput } from './auth.schemas.js';
import type { AuthUser } from './auth.types.js';
import { PasswordService } from './password.service.js';
import { SessionService } from './session.service.js';

export interface AuthResult {
  user: AuthUser;
  /** Raw session token, destined only for the cookie. */
  token: string;
  expiresAt: Date;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
  ) {}

  /**
   * Creates the account and its first session in one write, so there is never an account
   * without a session, nor a half-written one. `input.email` is already normalised.
   */
  async register(input: RegisterInput): Promise<AuthResult> {
    const passwordHash = await this.passwords.hash(input.password);
    const { token, tokenHash, expiresAt } = this.sessions.issue();

    try {
      const user = await this.prisma.user.create({
        data: {
          email: input.email,
          passwordHash,
          sessions: { create: { tokenHash, expiresAt } },
        },
        select: { id: true, email: true },
      });

      this.logger.log(`auth.register userId=${user.id}`);
      return { user, token, expiresAt };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ApiError(
          409,
          'EMAIL_ALREADY_REGISTERED',
          'An account with this email is already registered',
        );
      }
      throw error;
    }
  }

  /**
   * Unknown email and wrong password are indistinguishable: the same error, and a dummy
   * password verification keeps the work done similar when the user does not exist.
   * `input.email` is already normalised.
   */
  async login(input: LoginInput): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true, email: true, passwordHash: true },
    });

    const passwordMatches = user
      ? await this.passwords.verify(user.passwordHash, input.password)
      : await this.passwords.verifyDummy(input.password);

    if (!user || !passwordMatches) {
      this.logger.warn('auth.login.failed');
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    const session = await this.sessions.create(user.id);

    this.logger.log(`auth.login userId=${user.id}`);
    return { user: { id: user.id, email: user.email }, ...session };
  }

  /** Idempotent: revokes the session when there is one; there is nothing to do otherwise. */
  async logout(rawToken: string | undefined): Promise<void> {
    if (rawToken) {
      await this.sessions.revoke(rawToken);
    }
    this.logger.log('auth.logout');
  }
}
