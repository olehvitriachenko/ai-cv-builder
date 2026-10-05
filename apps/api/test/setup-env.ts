import { testDatabaseUrl } from './helpers/test-db.js';

// Runs before any test file imports the app, so PrismaService connects to the test database.
process.env.DATABASE_URL = testDatabaseUrl();
process.env.NODE_ENV = 'test';
