import { describe, test, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveTarget } from '../../lib/util/identity.js';

let dir;
before(() => { dir = mkdtempSync(join(tmpdir(), 'storymaps-cli-')); });
after(() => rmSync(dir, { recursive: true, force: true }));

const file = (name, content) => {
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
};
const missing = () => join(dir, 'missing.yml');

describe('resolveTarget', () => {
  test('a full URL gives its ID and site', async () => {
    assert.deepEqual(await resolveTarget('https://storymaps.io/abc12345', missing()), { id: 'abc12345', baseUrl: 'https://storymaps.io' });
    assert.deepEqual(await resolveTarget('http://localhost:3311/abc12345', missing()), { id: 'abc12345', baseUrl: 'http://localhost:3311' });
  });

  test('domain/ID uses https, and localhost means the dev server on port 3000', async () => {
    assert.deepEqual(await resolveTarget('maps.example.com/abc12345', missing()), { id: 'abc12345', baseUrl: 'https://maps.example.com' });
    assert.deepEqual(await resolveTarget('localhost/abc12345', missing()), { id: 'abc12345', baseUrl: 'http://localhost:3000' });
  });

  test('a bare ID uses the site in the local file, or storymaps.io', async () => {
    const selfHosted = file('self.yml', 'name: x\nsite: maps.example.com\n');
    assert.deepEqual(await resolveTarget('abc12345', selfHosted), { id: 'abc12345', baseUrl: 'https://maps.example.com' });
    assert.deepEqual(await resolveTarget('abc12345', missing()), { id: 'abc12345', baseUrl: 'https://storymaps.io' });
  });

  test('with no argument, the ID and site come from the local file', async () => {
    const pulled = file('pulled.yml', 'name: x\nid: abc12345\nsite: localhost\n');
    assert.deepEqual(await resolveTarget(undefined, pulled), { id: 'abc12345', baseUrl: 'http://localhost:3000' });
  });

  test('with no argument and no ID in the file, it says so', async () => {
    await assert.rejects(resolveTarget(undefined, file('noid.yml', 'name: x\n')), /No map ID provided/);
    await assert.rejects(resolveTarget(undefined, missing()), /No map ID provided/);
  });

  test('a URL without an ID is rejected', async () => {
    await assert.rejects(resolveTarget('https://storymaps.io/', missing()), /Could not extract map ID/);
  });
});
