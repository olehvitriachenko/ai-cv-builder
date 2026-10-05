import { execFileSync } from 'node:child_process';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import {
  API_ROOT,
  adminDatabaseUrl,
  testDatabaseName,
  testDatabaseUrl,
} from './helpers/test-db.js';

/** Creates the `<database>_test` database if it is missing and applies all migrations to it. */
export default async function setup(): Promise<void> {
  const name = testDatabaseName();
  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: adminDatabaseUrl() }),
  });

  try {
    const existing = await admin.$queryRaw<
      { datname: string }[]
    >`SELECT datname FROM pg_database WHERE datname = ${name}`;

    if (existing.length === 0) {
      // `name` is validated to letters, digits and underscores in test-db.ts.
      await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    }
  } finally {
    await admin.$disconnect();
  }

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy', '--config', 'prisma7.config.ts'], {
    cwd: API_ROOT,
    env: { ...process.env, DATABASE_URL: testDatabaseUrl() },
    stdio: 'inherit',
  });
}
