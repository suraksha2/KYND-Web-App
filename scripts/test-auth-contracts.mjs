import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const apps = [
  ['customer', 'src/context/AuthContext.jsx'],
  ['admin', 'admin/src/context/AuthContext.jsx'],
  ['provider', 'provider/src/context/AuthContext.jsx'],
  ['vendor', 'vendor/src/context/AuthContext.jsx'],
  ['superadmin', 'superadmin/src/context/AuthContext.tsx'],
];

for (const [app, path] of apps) {
  test(`${app} validates the server session and logs out remotely`, async () => {
    const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
    assert.match(source, /\/auth\/session/);
    assert.match(source, /\/auth\/logout/);
    assert.match(source, /method:\s*'POST'/);
    assert.match(source, /setUser\(null\)/);
    assert.match(source, /localStorage\.removeItem/);
  });
}

const clientWrappers = [
  ['customer', 'src/lib/api.js'],
  ['admin', 'admin/src/lib/authFetch.js'],
  ['provider', 'provider/src/lib/api.js'],
  ['vendor', 'vendor/src/lib/api.js'],
  ['superadmin', 'superadmin/src/lib/api.ts'],
];

for (const [app, path] of clientWrappers) {
  test(`${app} API client signals expired sessions`, async () => {
    const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
    assert.match(source, /status\s*===\s*401/);
    assert.match(source, /helpr:session-expired/);
  });
}
