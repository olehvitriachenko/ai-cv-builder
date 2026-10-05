import { testDatabaseUrl } from './helpers/test-db.js';

// Runs before any test file imports the app, so PrismaService connects to the test database.
process.env.DATABASE_URL = testDatabaseUrl();
process.env.NODE_ENV = 'test';

// The suite never talks to Anthropic: no key is configured and the CvGenerator port is replaced
// by a fake. Timers and the startup sweep stay off; lifecycle tests drive the runner directly.
delete process.env.ANTHROPIC_API_KEY;
process.env.GENERATION_AUTORUN = 'false';
