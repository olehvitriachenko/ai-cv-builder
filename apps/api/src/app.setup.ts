import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import { ConfigService } from '@nestjs/config';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ApiExceptionFilter } from './common/http/api-exception.filter.js';
import { MAX_PDF_BYTES } from './common/source-limits.js';

/** Shared by `main.ts` and the e2e tests so tests cannot drift from production wiring. */
export async function configureApp(app: NestFastifyApplication): Promise<void> {
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  await app.register(fastifyCookie);
  // Parsed lazily: the auth guard runs before a handler reads any part, so an unauthenticated
  // upload body is never read. An oversize file is flagged as truncated instead of throwing, so the
  // handler can answer with our own VALIDATION_ERROR.
  await app.register(fastifyMultipart, {
    limits: { fileSize: MAX_PDF_BYTES, files: 1, fields: 4 },
    throwFileSizeLimit: false,
  });
  // The browser calls the API cross-origin with credentials. @fastify/cors only allows
  // GET, HEAD and POST by default, so PUT (draft, answer) and DELETE (CV) must be listed or their
  // preflights fail in a real browser while inject()-based tests still pass.
  app.enableCors({
    origin: config.getOrThrow<string>('WEB_ORIGIN'),
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE'],
    // Lets the browser app read the file name of a PDF download (cross-origin responses hide it).
    exposedHeaders: ['Content-Disposition'],
  });
  app.useGlobalFilters(new ApiExceptionFilter());
}
