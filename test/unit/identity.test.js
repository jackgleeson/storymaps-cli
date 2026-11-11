import { describe, test, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveTarget, parseProjectLink } from '../../lib/util/identity.js';

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

  test('domain/ID uses https, and a server on this computer keeps its port, which it must name', async () => {
    assert.deepEqual(await resolveTarget('maps.example.com/abc12345', missing()), { id: 'abc12345', baseUrl: 'https://maps.example.com' });
    assert.deepEqual(await resolveTarget('localhost:3000/abc12345', missing()), { id: 'abc12345', baseUrl: 'http://localhost:3000' });
    assert.deepEqual(await resolveTarget('localhost:3312/abc12345', missing()), { id: 'abc12345', baseUrl: 'http://localhost:3312' });
    await assert.rejects(resolveTarget('localhost/abc12345', missing()), /localhost needs its port, such as localhost:3000/);
  });

  test('a map inside a project link gives the map ID, as a full URL or as domain/path', async () => {
    assert.deepEqual(await resolveTarget('https://storymaps.io/p/k8f2m9xq/abc12345', missing()), { id: 'abc12345', baseUrl: 'https://storymaps.io', projectId: 'k8f2m9xq' });
    assert.deepEqual(await resolveTarget('storymaps.io/p/k8f2m9xq/abc12345', missing()), { id: 'abc12345', baseUrl: 'https://storymaps.io', projectId: 'k8f2m9xq' });
  });

  test('a project link with no map is refused clearly, not read as a map ID', async () => {
    await assert.rejects(resolveTarget('storymaps.io/p/k8f2m9xq', missing()), /whole project, not one map/);
    await assert.rejects(resolveTarget('https://storymaps.io/p/k8f2m9xq/', missing()), /whole project, not one map/);
  });

  test('a project link is read as a project, with or without a map', () => {
    assert.deepEqual(parseProjectLink('storymaps.io/p/k8f2m9xq'), { projectId: 'k8f2m9xq', mapId: null, baseUrl: 'https://storymaps.io' });
    assert.deepEqual(parseProjectLink('http://localhost:3000/p/k8f2m9xq/abc12345'), { projectId: 'k8f2m9xq', mapId: 'abc12345', baseUrl: 'http://localhost:3000' });
    for (const notProject of ['storymaps.io/abc12345', 'abc12345', 'storymaps/abc12345.yml', undefined]) assert.equal(parseProjectLink(notProject), null, notProject);
  });

  test('a bare ID uses the site in the local file, or storymaps.io', async () => {
    const selfHosted = file('self.yml', 'name: x\nsite: maps.example.com\n');
    assert.deepEqual(await resolveTarget('abc12345', selfHosted), { id: 'abc12345', baseUrl: 'https://maps.example.com' });
    assert.deepEqual(await resolveTarget('abc12345', missing()), { id: 'abc12345', baseUrl: 'https://storymaps.io' });
  });

  test('with no argument, the ID and site come from the local file', async () => {
    const pulled = file('pulled.yml', 'name: x\nid: abc12345\nsite: localhost:3000\n');
    assert.deepEqual(await resolveTarget(undefined, pulled), { id: 'abc12345', baseUrl: 'http://localhost:3000' });
    // No port is assumed for a file that names none
    const old = file('old.yml', 'name: x\nid: abc12345\nsite: localhost\n');
    await assert.rejects(resolveTarget(undefined, old), /localhost needs its port/);
  });

  test('with no argument and no ID in the file, it says so', async () => {
    await assert.rejects(resolveTarget(undefined, file('noid.yml', 'name: x\n')), /No map ID provided/);
    await assert.rejects(resolveTarget(undefined, missing()), /No map ID provided/);
  });

  test('a URL without an ID is rejected', async () => {
    await assert.rejects(resolveTarget('https://storymaps.io/', missing()), /Could not extract map ID/);
  });
});
