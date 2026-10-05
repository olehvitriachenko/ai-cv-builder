import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { LightMyRequestResponse } from 'fastify';
import { z } from 'zod';

/** A valid free-text source (50 to 20,000 characters). */
export const VALID_SOURCE_TEXT =
  'Ten years as a backend engineer at Acme Corp (2016-2023), building REST APIs in Node.js and PostgreSQL. BSc Computer Science, State University, 2015. Contact: ada@example.com.';

export const VALID_TARGET_ROLE = 'Backend Engineer';

const statusSchema = z.object({ id: z.string() });

export function postCv(
  app: NestFastifyApplication,
  cookie: string | undefined,
  payload: object,
  query = '',
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: 'POST',
    url: `/api/cvs${query}`,
    headers: cookie ? { cookie } : {},
    payload,
  });
}

/** Creates a CV from free text through the API and returns its id; fails loudly unless 202. */
export async function createCvFromText(
  app: NestFastifyApplication,
  cookie: string,
  overrides: { targetRole?: string; sourceText?: string } = {},
): Promise<string> {
  const response = await postCv(app, cookie, {
    targetRole: overrides.targetRole ?? VALID_TARGET_ROLE,
    sourceText: overrides.sourceText ?? VALID_SOURCE_TEXT,
  });

  if (response.statusCode !== 202) {
    throw new Error(
      `createCvFromText expected 202 but got ${response.statusCode}: ${response.body}`,
    );
  }
  return statusSchema.parse(response.json()).id;
}

export function getStatus(
  app: NestFastifyApplication,
  cookie: string | undefined,
  id: string,
  query = '',
  headers: Record<string, string> = {},
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: 'GET',
    url: `/api/cvs/${id}${query}`,
    headers: { ...(cookie ? { cookie } : {}), ...headers },
  });
}
