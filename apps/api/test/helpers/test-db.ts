import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const API_ROOT = fileURLToPath(new URL('../../', import.meta.url));

function developmentDatabaseUrl(): URL {
  const envFile = join(API_ROOT, '.env');
  if (existsSync(envFile)) {
    // Does not override variables that are already set in the environment.
    process.loadEnvFile(envFile);
  }

  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error('DATABASE_URL is not defined; the e2e tests derive their database from it');
  }
  return new URL(raw);
}

/** `<database>_test`, so e2e tests never touch the development database. */
export function testDatabaseName(): string {
  const name = developmentDatabaseUrl().pathname.replace(/^\//, '');
  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    throw new Error('DATABASE_URL must name a database made of letters, digits and underscores');
  }
  return name.endsWith('_test') ? name : `${name}_test`;
}

export function testDatabaseUrl(): string {
  const url = developmentDatabaseUrl();
  url.pathname = `/${testDatabaseName()}`;
  return url.toString();
}

/** Same server, the maintenance database, used only to create the test database. */
export function adminDatabaseUrl(): string {
  const url = developmentDatabaseUrl();
  url.pathname = '/postgres';
  return url.toString();
}
