import fastifyCookie from '@fastify/cookie';
import { ConfigService } from '@nestjs/config';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ApiExceptionFilter } from './common/http/api-exception.filter.js';

/** Shared by `main.ts` and the e2e tests so tests cannot drift from production wiring. */
export async function configureApp(app: NestFastifyApplication): Promise<void> {
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  await app.register(fastifyCookie);
  app.enableCors({ origin: config.getOrThrow<string>('WEB_ORIGIN'), credentials: true });
  app.useGlobalFilters(new ApiExceptionFilter());
}
