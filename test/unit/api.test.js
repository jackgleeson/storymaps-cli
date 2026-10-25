import { describe, test, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
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
    assert.deepEqual(req.headers, { 'Content-Type': 'text/yaml', 'If-Match': '"abc"', 'X-Lock-Password': 'h' });
    assert.equal(req.body, 'name: x\n');
  });

  test('putMap without an ETag sends no If-Match, so it overwrites', async () => {
    await api.putMap(BASE, 'abc12345', '{}', { contentType: 'application/json' });
    assert.deepEqual(requests[0].headers, { 'Content-Type': 'application/json' });
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
    assert.equal((await failWith(429)).message, 'Rate limited — please wait and try again');
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

  test('other errors show the server message', async () => {
    assert.equal((await failWith(500, 'Internal Server Error')).message, 'Internal Server Error');
    assert.equal((await failWith(502)).message, 'Request failed (502)');
  });
});
