// Run after `npm run build` with `node --test scripts/test-admin-bootstrap.mjs`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { validateProductionConfig } = require('../dist/lib/runtimeConfig');
const repoRoot = resolve(fileURLToPath(new URL('../../../', import.meta.url)));

test('production refuses the retired public admin-bootstrap switch', () => {
  process.env.NODE_ENV = 'production';
  process.env.SESSION_SECRET = 'production-session-secret-at-least-16';
  process.env.ALLOWED_ORIGINS = 'https://shop.example.com';
  process.env.AIRWALLEX_ENV = 'demo';
  process.env.ADMIN_SIGNUP_ENABLED = 'true';
  assert.throws(validateProductionConfig, /Public admin signup is removed/);

  process.env.ADMIN_SIGNUP_ENABLED = 'false';
  assert.throws(validateProductionConfig, /AIRWALLEX_ENV must be prod/);
  process.env.AIRWALLEX_ENV = 'prod';
  process.env.AIRWALLEX_CLIENT_ID = 'test-client-id-123456';
  process.env.AIRWALLEX_API_KEY = 'test-api-key-123456';
  assert.doesNotThrow(validateProductionConfig);
  delete process.env.ADMIN_SIGNUP_ENABLED;
  delete process.env.AIRWALLEX_CLIENT_ID;
  delete process.env.AIRWALLEX_API_KEY;
});

test('admin SPA and signup API contain no public admin creation path', () => {
  const app = readFileSync(resolve(repoRoot, 'admin/src/App.jsx'), 'utf8');
  const auth = readFileSync(resolve(repoRoot, 'backend/db/src/routes/auth.ts'), 'utf8');
  assert.doesNotMatch(app, /secret-signup|pages\/Signup/);
  assert.doesNotMatch(auth, /ADMIN_SIGNUP_SECRET|assignedRole\s*=\s*['"]super_admin['"]/);
  assert.match(auth, /hasOwnProperty\.call\(body, ['"]secret['"]\)/);
});
