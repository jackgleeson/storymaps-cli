import { describe, test, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The cache lives in ~/.storymaps, so point HOME at a temporary folder before loading the module
const home = mkdtempSync(join(tmpdir(), 'storymaps-cli-home-'));
process.env.HOME = home;
const { detectFormat, readCache, writeCache, readEtag, writeEtag, readStorymap, writeStorymap } = await import('../../lib/util/file.js');
after(() => rmSync(home, { recursive: true, force: true }));

describe('the ETag each file was pulled or pushed at', () => {
  test('two copies of one map keep their own, so the older one still stops with a conflict', async () => {
    await writeEtag('copy0001', '/work/a/storymap.yml', '"v1"');
    await writeEtag('copy0001', '/work/b/storymap.yml', '"v1"');
    // A push from folder a moves the map on, and only a records it
    await writeEtag('copy0001', '/work/a/storymap.yml', '"v2"');
    assert.equal(await readEtag('copy0001', '/work/a/storymap.yml'), '"v2"');
    assert.equal(await readEtag('copy0001', '/work/b/storymap.yml'), '"v1"');
  });

  test('a file from an older version uses the one ETag kept for the map, which is no longer written', async () => {
    await writeCache('old00001', { etag: '"legacy"', hash: 'h' });
    assert.equal(await readEtag('old00001', '/work/storymap.yml'), '"legacy"');
    await writeEtag('old00001', '/work/storymap.yml', '"new"');
    assert.equal(await readEtag('old00001', '/work/storymap.yml'), '"new"');
    assert.equal(await readEtag('old00001', '/elsewhere/storymap.yml'), '"legacy"');
    assert.equal((await readCache('old00001')).hash, 'h');
  });

  test('no ETag from the server leaves nothing recorded', async () => {
    await writeEtag('none0002', '/work/storymap.yml', null);
    assert.equal(await readEtag('none0002', '/work/storymap.yml'), undefined);
  });
});

describe('detectFormat', () => {
  test('.json is JSON, anything else is YAML', () => {
    assert.equal(detectFormat('map.json'), 'json');
    assert.equal(detectFormat('MAP.JSON'), 'json');
    assert.equal(detectFormat('storymap.yml'), 'yaml');
    assert.equal(detectFormat('storymap.yaml'), 'yaml');
    assert.equal(detectFormat('storymap'), 'yaml');
  });
});

describe('the per-map cache', () => {
  test('starts empty', async () => {
    assert.deepEqual(await readCache('none0001'), {});
  });

  test('keeps the ETag and lock password hash, and null removes a value', async () => {
    await writeCache('abc12345', { etag: '"one"' });
    await writeCache('abc12345', { hash: 'h' });
    assert.deepEqual(await readCache('abc12345'), { etag: '"one"', hash: 'h' });
    await writeCache('abc12345', { hash: null });
    assert.deepEqual(await readCache('abc12345'), { etag: '"one"' });
  });

  test('is kept under ~/.storymaps/caches', () => {
    assert.ok(existsSync(join(home, '.storymaps', 'caches', 'abc12345.json')));
  });
});

describe('reading and writing maps', () => {
  test('reads YAML and JSON files', async () => {
    const yaml = join(home, 'map.yml');
    const json = join(home, 'map.json');
    writeFileSync(yaml, 'name: From YAML\nsteps:\n  - A\n');
    writeFileSync(json, '{"name":"From JSON"}');
    assert.equal((await readStorymap(yaml)).name, 'From YAML');
    assert.equal((await readStorymap(json)).name, 'From JSON');
  });

  test('writes map JSON as YAML, and text as it is', async () => {
    const out = join(home, 'out.yml');
    await writeStorymap(out, { name: 'Written', steps: [{ name: 'A' }], slices: [] });
    assert.equal((await readStorymap(out)).name, 'Written');
    await writeStorymap(out, 'name: Raw\n');
    assert.equal((await readStorymap(out)).name, 'Raw');
  });
});
