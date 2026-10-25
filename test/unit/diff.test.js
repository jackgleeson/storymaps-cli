import { describe, test, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { diffCommand } from '../../lib/commands/diff.js';

// diff reads storymap.yml from the current folder and the map from the server, so run it in a
// temporary folder with fetch replaced and the output collected
const realFetch = globalThis.fetch;
const realLog = console.log;
const startDir = process.cwd();
let dir, output, remote;

const map = (cards) => [
  'name: Shop',
  'id: abc12345',
  'site: storymaps.io',
  'steps:',
  '  - Browse',
  'slices:',
  '  - name: MVP',
  '    stories:',
  '      Browse:',
  ...cards.map(name => `        - name: ${name}`),
  '',
].join('\n');

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'storymaps-diff-'));
  process.chdir(dir);
  output = [];
  console.log = (...args) => output.push(args.join(' ').replace(/\x1b\[[0-9;]*m/g, ''));
  globalThis.fetch = async () => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => remote });
});
afterEach(() => {
  process.chdir(startDir);
  rmSync(dir, { recursive: true, force: true });
  console.log = realLog;
  globalThis.fetch = realFetch;
});

describe('diff', () => {
  test('a card added to the local file shows as added, as push would show it', async () => {
    remote = map(['Search']);
    writeFileSync(join(dir, 'storymap.yml'), map(['Search', 'Filter']));
    await diffCommand(undefined, undefined, {});
    assert.equal(output[0].trim(), '+ MVP: 1 card');
  });

  test('a card only on the server shows as removed', async () => {
    remote = map(['Search', 'Filter']);
    writeFileSync(join(dir, 'storymap.yml'), map(['Search']));
    await diffCommand(undefined, undefined, {});
    assert.equal(output[0].trim(), '- MVP: 1 card');
  });

  test('--full goes from the remote to the local file', async () => {
    remote = map(['Search']);
    writeFileSync(join(dir, 'storymap.yml'), map(['Search', 'Filter']));
    await diffCommand(undefined, undefined, { full: true });
    assert.equal(output[0], '--- remote: https://storymaps.io/abc12345');
    assert.equal(output[1], `+++ local: ${join(dir, 'storymap.yml')}`);
    assert.ok(output.some(line => /\+ +- name: Filter$/.test(line)));
  });

  test('two local files go from the first to the second', async () => {
    writeFileSync(join(dir, 'old.yml'), map(['Search']));
    writeFileSync(join(dir, 'new.yml'), map(['Search', 'Filter']));
    await diffCommand('old.yml', 'new.yml', {});
    assert.equal(output[0].trim(), '+ MVP: 1 card');
  });
});
