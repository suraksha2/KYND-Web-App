import path from 'path';
import dotenv from 'dotenv';

const projectRoot = path.join(__dirname, '..');

// Load local configuration before importing modules that initialize the API.
dotenv.config({ path: path.join(projectRoot, '.env.local') });
dotenv.config({ path: path.join(projectRoot, '.env') });

import('./server.js').catch((error) => {
  console.error('[boot] API startup failed:', error?.message || error);
  process.exitCode = 1;
});
