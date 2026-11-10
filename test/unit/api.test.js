import { describe, test, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import * as api from '../../lib/util/api.js';

// Replace fetch with a recorder that answers with a canned response
const realFetch = globalThis.fetch;
let requests;
let reply;
beforeEach(() => {
  requests = [];
  reply = { status: 200, body: '{}', headers: {} };
  globalThis.fetch = async (url, opts = {}) => {
    requests.push({ url, ...opts });
    const { status, body, headers } = reply;
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (name) => headers[name.toLowerCase()] ?? null },
      text: async () => body,
      json: async () => JSON.parse(body),
    };
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

const BASE = 'https://storymaps.io';

describe('requests', () => {
  test('getMap asks for YAML and returns the ETag', async () => {
    reply = { status: 200, body: 'name: x\n', headers: { etag: '"abc"' } };
    assert.deepEqual(await api.getMap(BASE, 'abc12345'), { data: 'name: x\n', etag: '"abc"' });
    assert.equal(requests[0].url, `${BASE}/api/maps/abc12345?format=yaml`);
  });

  test('getMap can ask for JSON', async () => {
    reply = { status: 200, body: '{"name":"x"}', headers: {} };
    assert.deepEqual((await api.getMap(BASE, 'abc12345', 'json')).data, { name: 'x' });
  });

  test('putMap sends the body with If-Match and the lock password when given', async () => {
    reply = { status: 200, body: '{"ok":true}', headers: {} };
    await api.putMap(BASE, 'abc12345', 'name: x\n', { etag: '"abc"', lockPasswordHash: 'h' });
    const [req] = requests;
    assert.equal(req.method, 'PUT');
    assert.equal(req.url, `${BASE}/api/maps/abc12345`);
    assert.deepEqual(req.headers, { 'User-Agent': api.USER_AGENT, 'Content-Type': 'text/yaml', 'If-Match': '"abc"', 'X-Lock-Password': 'h' });
    assert.equal(req.body, 'name: x\n');
  });

  test('putMap marks a restore, so the server logs it as one', async () => {
    await api.putMap(BASE, 'abc12345', '{}', { contentType: 'application/json', restoredBackup: '0123456789ab' });
    assert.equal(requests[0].headers['X-Restored-Backup'], '0123456789ab');
  });

  test('putMap without an ETag sends no If-Match, so it overwrites', async () => {
    await api.putMap(BASE, 'abc12345', '{}', { contentType: 'application/json' });
    assert.deepEqual(requests[0].headers, { 'User-Agent': api.USER_AGENT, 'Content-Type': 'application/json' });
  });

  test('postMap creates a map', async () => {
    reply = { status: 201, body: '{"id":"new12345"}', headers: {} };
    assert.deepEqual(await api.postMap(BASE, 'name: x\n'), { id: 'new12345' });
    assert.equal(requests[0].url, `${BASE}/api/maps`);
    assert.equal(requests[0].method, 'POST');
  });

  test('the lock calls send the password hash as JSON', async () => {
    reply = { status: 200, body: '{"ok":true}', headers: {} };
    await api.lockMap(BASE, 'abc12345', 'h1');
    await api.unlockMap(BASE, 'abc12345', 'h2');
    await api.removeLock(BASE, 'abc12345', 'h3');
    assert.deepEqual(requests.map(r => [r.url.replace(BASE, ''), JSON.parse(r.body).passwordHash]), [
      ['/api/lock/abc12345', 'h1'], ['/api/lock/abc12345/unlock', 'h2'], ['/api/lock/abc12345/remove', 'h3'],
    ]);
  });

  test('getLog and getLockStatus read their endpoints', async () => {
    reply = { status: 200, body: '[]', headers: {} };
    await api.getLog(BASE, 'abc12345');
    reply = { status: 200, body: '{"isLocked":false}', headers: {} };
    assert.deepEqual(await api.getLockStatus(BASE, 'abc12345'), { isLocked: false });
    assert.deepEqual(requests.map(r => r.url.replace(BASE, '')), ['/api/maps/abc12345/log', '/api/lock/abc12345']);
  });

  test('the backup calls list, fetch and make backups', async () => {
    reply = { status: 200, body: '{"id":"0123456789ab","cardCount":4}', headers: {} };
    await api.listBackups(BASE, 'abc12345');
    await api.getBackup(BASE, 'abc12345', '0123456789ab');
    assert.deepEqual(await api.createBackup(BASE, 'abc12345', 'Before the workshop'), { id: '0123456789ab', cardCount: 4 });
    assert.deepEqual(requests.map(r => [r.method || 'GET', r.url.replace(BASE, '')]), [
      ['GET', '/api/backups/abc12345'], ['GET', '/api/backups/abc12345/0123456789ab'], ['POST', '/api/backups/abc12345'],
    ]);
    assert.deepEqual(JSON.parse(requests[2].body), { note: 'Before the workshop' });
  });

  test('making a backup sends the lock password when there is one', async () => {
    reply = { status: 200, body: '{"id":"0123456789ab"}', headers: {} };
    await api.createBackup(BASE, 'abc12345', '');
    await api.createBackup(BASE, 'abc12345', '', { lockPasswordHash: 'hash' });
    assert.equal(requests[0].headers['X-Lock-Password'], undefined);
    assert.equal(requests[1].headers['X-Lock-Password'], 'hash');
  });

  test('every request names the CLI and its version', async () => {
    const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'));
    assert.equal(api.USER_AGENT, `storymaps-cli/${version}`);
    await api.getMap(BASE, 'abc12345');
    await api.getNewId(BASE);
    await api.postMap(BASE, 'name: x\n');
    await api.lockMap(BASE, 'abc12345', 'h');
    assert.ok(requests.every(r => r.headers['User-Agent'] === api.USER_AGENT));
  });
});

describe('errors', () => {
  const failWith = async (status, body = '') => {
    reply = { status, body, headers: {} };
    try { await api.getMap(BASE, 'abc12345'); } catch (err) { return err; }
    assert.fail('expected an error');
  };

  test('maps the server status codes to clear messages', async () => {
    assert.equal((await failWith(404)).message, 'Map not found');
    assert.equal((await failWith(423)).message, 'Map is locked');
    assert.equal((await failWith(429)).message, 'Rate limited. Please wait and try again.');
  });

  test('a 409 is a conflict, with the server message', async () => {
    const err = await failWith(409, '{"error":"Conflict: map has been modified since last pull."}');
    assert.equal(err.conflict, true);
    assert.equal(err.status, 409);
    assert.equal(err.message, 'Conflict: map has been modified since last pull.');
  });

  test('a wrong password when unlocking or removing a lock says so', async () => {
    reply = { status: 403, body: '{"ok":false}', headers: {} };
    await assert.rejects(api.unlockMap(BASE, 'abc12345', 'h'), /Incorrect password/);
    await assert.rejects(api.removeLock(BASE, 'abc12345', 'h'), /Incorrect password/);
  });

  test('locking a map someone else already locked gives a readable message', async () => {
    reply = { status: 403, body: '{"error":"Map is already locked"}', headers: {} };
    await assert.rejects(api.lockMap(BASE, 'abc12345', 'h'), (err) => err.message === 'Map is already locked');
  });

  test('a missing backup names the backup, not the map', async () => {
    reply = { status: 404, body: '{"error":"Backup not found"}', headers: {} };
    await assert.rejects(api.getBackup(BASE, 'abc12345', 'nothere'), (err) => err.message === 'Backup not found: nothere');
  });

  test('a server that turns away backups from the CLI says so', async () => {
    reply = { status: 403, body: '{"error":"Forbidden"}', headers: {} };
    await assert.rejects(api.createBackup(BASE, 'abc12345'), /does not take backups from the CLI yet/);
  });

  test('other errors show the server message', async () => {
    assert.equal((await failWith(500, 'Internal Server Error')).message, 'Internal Server Error');
    assert.equal((await failWith(502)).message, 'Request failed (502)');
  });
});
