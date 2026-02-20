// Storymaps CLI — AGPL-3.0 — see LICENCE for details
// Resolve a target argument (ID, URL, domain/ID, or local file) to { id, baseUrl }

import { readFile } from 'node:fs/promises';
import jsyaml from 'js-yaml';

const DEFAULT_SITE = 'storymaps.io';

function siteToBaseUrl(site) {
    if (!site) return `https://${DEFAULT_SITE}`;
    if (site === 'localhost') return 'http://localhost:3000';
    return `https://${site}`;
}

export async function resolveTarget(arg, localFilePath = 'storymap.yml') {
    // Full URL: https://storymaps.io/abc123
    if (arg && /^https?:\/\//i.test(arg)) {
        const url = new URL(arg);
        const id = url.pathname.split('/').filter(Boolean).pop();
        if (!id) throw new Error(`Could not extract map ID from URL: ${arg}`);
        const baseUrl = `${url.protocol}//${url.host}`;
        return { id, baseUrl };
    }

    // domain/id: storymaps.io/abc123
    if (arg && arg.includes('/')) {
        const url = new URL(`https://${arg}`);
        const id = url.pathname.split('/').filter(Boolean).pop();
        if (!id) throw new Error(`Could not extract map ID from: ${arg}`);
        const baseUrl = siteToBaseUrl(url.hostname);
        return { id, baseUrl };
    }

    // Bare ID or no arg — read local file for site context
    let site;
    let fileId;
    try {
        const content = await readFile(localFilePath, 'utf-8');
        const obj = jsyaml.load(content);
        if (obj && typeof obj === 'object') {
            site = obj.site;
            fileId = obj.id;
        }
    } catch {
        // File may not exist — that's fine if we have an arg
    }

    const baseUrl = siteToBaseUrl(site);

    // Bare ID: abc123
    if (arg) return { id: arg, baseUrl };

    // No arg — use file's id
    if (!fileId) throw new Error('No map ID provided and no "id" found in local file');
    return { id: fileId, baseUrl };
}
