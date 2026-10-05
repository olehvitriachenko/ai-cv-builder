import { ConsoleLogger, Logger, type LoggerService } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PrismaService } from '../src/infrastructure/index.js';
import { hashSessionToken } from '../src/modules/auth/session-token.js';
import { createTestApp } from './helpers/create-test-app.js';
import { loginUser, registerUser, uniqueEmail } from './helpers/users.js';

describe('logging hygiene', () => {
  const lines: string[] = [];
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  const capture: LoggerService = {
    log: (message: unknown, ...rest: unknown[]) => lines.push(render(message, rest)),
    warn: (message: unknown, ...rest: unknown[]) => lines.push(render(message, rest)),
    error: (message: unknown, ...rest: unknown[]) => lines.push(render(message, rest)),
    debug: (message: unknown, ...rest: unknown[]) => lines.push(render(message, rest)),
    verbose: (message: unknown, ...rest: unknown[]) => lines.push(render(message, rest)),
  };

  function render(message: unknown, rest: unknown[]): string {
    return [message, ...rest].map((part) => JSON.stringify(part)).join(' ');
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    // Installed after the app exists: Nest's testing module sets its own silent logger on compile.
    Logger.overrideLogger(capture);
  });

  afterAll(async () => {
    await app.close();
    Logger.overrideLogger(new ConsoleLogger());
  });

  it('never logs passwords, session tokens, hashes or emails across the auth flows', async () => {
    const password = 'unique-password-for-log-test';
    const wrongPassword = 'unique-WRONG-password-for-log-test';
    const email = uniqueEmail('log');

    const registered = await registerUser(app, { email, password });
    await loginUser(app, { email, password: wrongPassword });
    const login = await loginUser(app, { email, password });
    await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: registered.cookie },
    });
    await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie: registered.cookie },
    });
    await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email, password } });

    const stored = await prisma.user.findUniqueOrThrow({ where: { email } });
    const rawTokens = [registered.cookie, login.cookie ?? ''].map((c) => c.slice('sid='.length));
    const secrets = [
      password,
      wrongPassword,
      email,
      stored.passwordHash,
      ...rawTokens,
      ...rawTokens.map(hashSessionToken),
    ];

    const output = lines.join('\n');
    expect(output).toContain('auth.register'); // the capture really sees our logs
    for (const secret of secrets) {
      expect(output).not.toContain(secret);
    }
  });
});
