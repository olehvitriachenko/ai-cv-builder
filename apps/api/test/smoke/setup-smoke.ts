import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const apiRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

config({
  path: path.join(apiRoot, '.env'),
});
