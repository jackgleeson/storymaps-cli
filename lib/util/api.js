// Storymaps CLI — AGPL-3.0 — see LICENCE for details
// HTTP client for storymaps.io API (uses Node 18+ built-in fetch)

import { readFileSync } from 'node:fs';

// Every request names the CLI and its version, so the server can tell CLI use from other scripts
const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'));
export const USER_AGENT = `storymaps-cli/${pkg.version}`;

const request = (url, opts = {}) => fetch(url, { ...opts, headers: { 'User-Agent': USER_AGENT, ...opts.headers } });

class ApiError extends Error {
    constructor(message, status, { conflict = false } = {}) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.conflict = conflict;
    }
}

// The server sends errors as JSON ({"error": "..."}), so show just the message
function errorMessage(body) {
    try {
        return JSON.parse(body).error || body;
    } catch {
        return body;
    }
}

async function handleResponse(res) {
    if (res.ok) return;
    const body = errorMessage(await res.text().catch(() => ''));
    switch (res.status) {
        case 404: throw new ApiError('Map not found', 404);
        case 409: throw new ApiError(body || 'Conflict — the remote map has changed. Pull first or use --force.', 409, { conflict: true });
        case 423: throw new ApiError('Map is locked', 423);
        case 429: throw new ApiError('Rate limited — please wait and try again', 429);
        default: throw new ApiError(body || `Request failed (${res.status})`, res.status);
    }
}

export async function getMap(baseUrl, id, format = 'yaml') {
    const res = await request(`${baseUrl}/api/maps/${id}?format=${format}`);
    await handleResponse(res);
    const etag = res.headers.get('etag');
    const data = format === 'json' ? await res.json() : await res.text();
    return { data, etag };
}

export async function putMap(baseUrl, id, body, { etag, contentType = 'text/yaml', lockPasswordHash, restoredBackup } = {}) {
    const headers = { 'Content-Type': contentType };
    if (etag) headers['If-Match'] = etag;
    if (lockPasswordHash) headers['X-Lock-Password'] = lockPasswordHash;
    // Tells the server this push is a restore, so the activity log says so
    if (restoredBackup) headers['X-Restored-Backup'] = restoredBackup;
    const res = await request(`${baseUrl}/api/maps/${id}`, {
        method: 'PUT',
        headers,
        body,
    });
    await handleResponse(res);
    return res.json();
}

export async function postMap(baseUrl, body, contentType = 'text/yaml') {
    const res = await request(`${baseUrl}/api/maps`, {
        method: 'POST',
        headers: { 'Content-Type': contentType },
        body,
    });
    await handleResponse(res);
    return res.json();
}

export async function getNewId(baseUrl) {
    const res = await request(`${baseUrl}/api/maps/new-id`);
    await handleResponse(res);
    return res.json();
}

export async function getLockStatus(baseUrl, id) {
    const res = await request(`${baseUrl}/api/lock/${id}`);
    await handleResponse(res);
    return res.json();
}

export async function lockMap(baseUrl, id, passwordHash) {
    const res = await request(`${baseUrl}/api/lock/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passwordHash }),
    });
    await handleResponse(res);
    return res.json();
}

export async function unlockMap(baseUrl, id, passwordHash) {
    const res = await request(`${baseUrl}/api/lock/${id}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passwordHash }),
    });
    if (res.status === 403) throw new ApiError('Incorrect password', 403);
    await handleResponse(res);
    return res.json();
}

export async function removeLock(baseUrl, id, passwordHash) {
    const res = await request(`${baseUrl}/api/lock/${id}/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passwordHash }),
    });
    if (res.status === 403) throw new ApiError('Incorrect password', 403);
    await handleResponse(res);
    return res.json();
}

export async function getLog(baseUrl, id) {
    const res = await request(`${baseUrl}/api/maps/${id}/log`);
    await handleResponse(res);
    return res.json();
}

export async function listBackups(baseUrl, id) {
    const res = await request(`${baseUrl}/api/backups/${id}`);
    await handleResponse(res);
    return res.json();
}

export async function getBackup(baseUrl, id, backupId) {
    const res = await request(`${baseUrl}/api/backups/${id}/${encodeURIComponent(backupId)}`);
    if (res.status === 404) throw new ApiError(`Backup not found: ${backupId}`, 404);
    await handleResponse(res);
    return res.json();
}

// Answers with the new backup, or with a kept backup marked unchanged when the map matches it
export async function createBackup(baseUrl, id, note = '', { lockPasswordHash } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (lockPasswordHash) headers['X-Lock-Password'] = lockPasswordHash;
    const res = await request(`${baseUrl}/api/backups/${id}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ note }),
    });
    // Servers from before the CLI could make backups turn the request away
    if (res.status === 403) throw new ApiError('This server does not take backups from the CLI yet. Make the backup in the app, or update the server', 403);
    await handleResponse(res);
    return res.json();
}

export { ApiError };
