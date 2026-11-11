// Storymaps CLI — AGPL-3.0 — see LICENCE for details
// Resolve a target argument (ID, URL, domain/ID, or local file) to { id, baseUrl }

import { readFile } from 'node:fs/promises';
import jsyaml from 'js-yaml';

const DEFAULT_SITE = 'storymaps.io';

function siteToBaseUrl(site) {
    if (!site) return `https://${DEFAULT_SITE}`;
    if (site === 'localhost') return 'http://localhost:3000';
    // A local server on another port says so, such as localhost:3312
    if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(site)) return `http://${site}`;
    return `https://${site}`;
}

export { siteToBaseUrl };

// A link or domain/path, as a URL and its server, or null for a bare ID or file name
function parseLink(arg) {
    if (!arg) return null;
    if (/^https?:\/\//i.test(arg)) {
        const url = new URL(arg);
        return { url, baseUrl: `${url.protocol}//${url.host}` };
    }
    if (arg.includes('/') && !/\.(ya?ml|json)$/i.test(arg)) {
        const url = new URL(`https://${arg}`);
        return { url, baseUrl: siteToBaseUrl(url.hostname) };
    }
    return null;
}

// A project link: storymaps.io/p/<project> or storymaps.io/p/<project>/<map>.
// Returns { projectId, mapId (or null), baseUrl }, or null when the target isn't a project link.
export function parseProjectLink(arg) {
    const link = parseLink(arg);
    if (!link) return null;
    const parts = link.url.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'p' || parts.length < 2 || parts.length > 3) return null;
    return { projectId: parts[1], mapId: parts[2] || null, baseUrl: link.baseUrl };
}

export async function resolveTarget(arg, localFilePath = 'storymap.yml') {
    const link = parseLink(arg);
    if (link) {
        const project = parseProjectLink(arg);
        if (project && !project.mapId) {
            throw new Error(`That's a link to a whole project, not one map. Add the map to the link, such as ${arg.replace(/\/+$/, '')}/<map ID>, or run this in the project's folder.`);
        }
        const id = project ? project.mapId : link.url.pathname.split('/').filter(Boolean).pop();
        if (!id) throw new Error(`Could not extract map ID from: ${arg}`);
        return { id, baseUrl: link.baseUrl, ...(project ? { projectId: project.projectId } : {}) };
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
