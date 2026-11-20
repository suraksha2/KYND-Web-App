// Run after `npm run build` with:
// node --test scripts/test-client-categories-concurrency.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);

test('simultaneous client-category creates preserve every row with unique IDs', async () => {
  const originalCwd = process.cwd();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'client-categories-'));
  let server;

  try {
    const dataDir = path.join(tempDir, 'data');
    await mkdir(dataDir);
    await writeFile(path.join(dataDir, 'client-categories.json'), '[]', 'utf8');
    process.chdir(tempDir);

    const express = require('../node_modules/express');
    const clientCategories = require('../dist/routes/client-categories').default;
    const app = express();
    app.use(express.json());
    app.use('/api/client-categories', clientCategories);
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

    const address = server.address();
    const endpoint = `http://127.0.0.1:${address.port}/api/client-categories`;
    const requestCount = 64;
    const responses = await Promise.all(
      Array.from({ length: requestCount }, (_, index) =>
        fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: `Category ${index}` }),
        })
      )
    );
    const created = await Promise.all(responses.map(async (response) => {
      assert.equal(response.status, 201);
      return (await response.json()).data;
    }));
    const listResponse = await fetch(endpoint);
    const { data: saved } = await listResponse.json();

    assert.equal(listResponse.status, 200);
    assert.equal(saved.length, requestCount);
    assert.equal(new Set(created.map((category) => category.id)).size, requestCount);
    assert.ok(created.every((category) => /^cat_[0-9a-f-]{36}$/i.test(category.id)));
    assert.deepEqual(
      new Set(saved.map((category) => category.name)),
      new Set(Array.from({ length: requestCount }, (_, index) => `Category ${index}`))
    );
  } finally {
    if (server?.listening) {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true, force: true });
  }
});
