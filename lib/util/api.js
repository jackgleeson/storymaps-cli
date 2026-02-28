// Storymaps CLI — AGPL-3.0 — see LICENCE for details
// HTTP client for storymaps.io API (uses Node 18+ built-in fetch)

class ApiError extends Error {
    constructor(message, status, { conflict = false } = {}) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.conflict = conflict;
    }
}

async function handleResponse(res) {
    if (res.ok) return;
    const body = await res.text().catch(() => '');
    switch (res.status) {
        case 404: throw new ApiError('Map not found', 404);
        case 409: throw new ApiError(body || 'Conflict — the remote map has changed. Pull first or use --force.', 409, { conflict: true });
        case 423: throw new ApiError('Map is locked', 423);
        case 429: throw new ApiError('Rate limited — please wait and try again', 429);
        default: throw new ApiError(body || `Request failed (${res.status})`, res.status);
    }
}

export async function getMap(baseUrl, id, format = 'yaml') {
    const res = await fetch(`${baseUrl}/api/maps/${id}?format=${format}`);
    await handleResponse(res);
    const etag = res.headers.get('etag');
    const data = format === 'json' ? await res.json() : await res.text();
    return { data, etag };
}

export async function putMap(baseUrl, id, body, { etag, contentType = 'text/yaml', lockPasswordHash } = {}) {
    const headers = { 'Content-Type': contentType };
    if (etag) headers['If-Match'] = etag;
    if (lockPasswordHash) headers['X-Lock-Password'] = lockPasswordHash;
    const res = await fetch(`${baseUrl}/api/maps/${id}`, {
        method: 'PUT',
        headers,
        body,
    });
    await handleResponse(res);
    return res.json();
}

export async function postMap(baseUrl, body, contentType = 'text/yaml') {
    const res = await fetch(`${baseUrl}/api/maps`, {
        method: 'POST',
        headers: { 'Content-Type': contentType },
        body,
    });
    await handleResponse(res);
    return res.json();
}

export async function getNewId(baseUrl) {
    const res = await fetch(`${baseUrl}/api/maps/new-id`);
    await handleResponse(res);
    return res.json();
}

export async function getLockStatus(baseUrl, id) {
    const res = await fetch(`${baseUrl}/api/lock/${id}`);
    await handleResponse(res);
    return res.json();
}

export async function lockMap(baseUrl, id, passwordHash) {
    const res = await fetch(`${baseUrl}/api/lock/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passwordHash }),
    });
    await handleResponse(res);
    return res.json();
}

export async function unlockMap(baseUrl, id, passwordHash) {
    const res = await fetch(`${baseUrl}/api/lock/${id}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passwordHash }),
    });
    if (res.status === 403) throw new ApiError('Incorrect password', 403);
    await handleResponse(res);
    return res.json();
}

export async function removeLock(baseUrl, id, passwordHash) {
    const res = await fetch(`${baseUrl}/api/lock/${id}/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passwordHash }),
    });
    if (res.status === 403) throw new ApiError('Incorrect password', 403);
    await handleResponse(res);
    return res.json();
}

export async function getLog(baseUrl, id) {
    const res = await fetch(`${baseUrl}/api/maps/${id}/log`);
    await handleResponse(res);
    return res.json();
}

export { ApiError };
