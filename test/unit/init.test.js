import { describe, test, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import jsyaml from 'js-yaml';
import { initCommand } from '../../lib/commands/init.js';
import { importFromYaml } from '../../lib/core/yaml.js';

// init writes storymap.yml to the current folder and creates the map on the server, so run it
// in a temporary folder with fetch replaced and the output collected
const realFetch = globalThis.fetch;
const realLog = console.log;
const startDir = process.cwd();
let dir, output, requests, reply;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'storymaps-init-'));
  process.chdir(dir);
  output = [];
  requests = [];
  reply = { status: 201, body: '{"id":"abc12345"}' };
  console.log = (...args) => output.push(args.join(' ').replace(/\x1b\[[0-9;]*m/g, ''));
  globalThis.fetch = async (url, opts = {}) => {
    requests.push({ url, ...opts });
    return { ok: reply.status < 300, status: reply.status, text: async () => reply.body, json: async () => JSON.parse(reply.body) };
  };
});
afterEach(() => {
  process.chdir(startDir);
  rmSync(dir, { recursive: true, force: true });
  console.log = realLog;
  globalThis.fetch = realFetch;
});

const written = () => readFileSync(join(dir, 'storymap.yml'), 'utf-8');

describe('init', () => {
  test('creates the map on the server and prints its URL', async () => {
    await initCommand({});
    assert.equal(requests[0].url, 'https://storymaps.io/api/maps');
    assert.equal(output[0], 'Created storymap.yml (map ID: abc12345)');
    assert.equal(output[1].trim(), 'https://storymaps.io/abc12345');
  });

  test('writes the map ID into storymap.yml', async () => {
    await initCommand({});
    const map = jsyaml.load(written());
    assert.equal(map.id, 'abc12345');
    assert.equal(map.site, 'storymaps.io');
  });

  test('the starter map has no notes', async () => {
    await initCommand({});
    assert.equal('notes' in jsyaml.load(written()), false);
    assert.equal('notes' in jsyaml.load(requests[0].body), false, 'nor the copy sent to the server');
  });

  test('the starter map is valid', async () => {
    await initCommand({});
    assert.doesNotThrow(() => importFromYaml(written()));
  });

  test('a self-hosted site gets its own URL', async () => {
    await initCommand({ site: 'maps.example.com' });
    assert.equal(requests[0].url, 'https://maps.example.com/api/maps');
    assert.equal(output[1].trim(), 'https://maps.example.com/abc12345');
  });

  test('if the server cannot be reached, it still writes the file and suggests pushing later', async () => {
    reply = { status: 500, body: 'down' };
    await initCommand({});
    assert.equal(output[0].trim(), 'Created storymap.yml');
    assert.match(output[1], /run "storymaps push"/);
    assert.equal('id' in jsyaml.load(written()), false);
  });
});
