// Storymaps CLI — AGPL-3.0 — see LICENCE for details
// File I/O utilities for reading/writing storymap files

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, basename, join, extname } from 'node:path';
import { exportToYaml, loadYaml, keepHashes } from '../core/yaml.js';

const STORYMAPS_DIR = join(homedir(), '.storymaps');
const CACHE_DIR = join(STORYMAPS_DIR, 'caches');

function cachePathFor(mapId) {
    return join(CACHE_DIR, `${mapId}.json`);
}

export async function readCache(mapId) {
    try {
        return JSON.parse(await readFile(cachePathFor(mapId), 'utf-8'));
    } catch {
        return {};
    }
}

export async function writeCache(mapId, updates) {
    await mkdir(CACHE_DIR, { recursive: true });
    const cache = await readCache(mapId);
    for (const [k, v] of Object.entries(updates)) {
        if (v === null) delete cache[k];
        else cache[k] = v;
    }
    await writeFile(cachePathFor(mapId), JSON.stringify(cache), 'utf-8');
}

// The ETag of the map as each file last pulled or pushed it, by the file's full path. Two copies of
// one map on the same computer each keep their own, so a push from an older copy stops with a
// conflict instead of overwriting what the other pushed. Versions up to 1.3.4 kept one ETag per map;
// it's still read for files pulled with them, and no longer written.
export async function readEtag(mapId, filePath) {
    const cache = await readCache(mapId);
    return cache.files?.[filePath] ?? cache.etag;
}

export async function writeEtag(mapId, filePath, etag) {
    if (!etag) return;
    const cache = await readCache(mapId);
    await writeCache(mapId, { files: { ...cache.files, [filePath]: etag } });
}


export function detectFormat(filePath) {
    const ext = extname(filePath).toLowerCase();
    if (ext === '.json') return 'json';
    return 'yaml';
}

export async function readStorymap(filePath) {
    const content = await readFile(filePath, 'utf-8');
    const format = detectFormat(filePath);
    if (format === 'json') {
        return JSON.parse(content);
    }
    return loadYaml(content);
}

export async function writeStorymap(filePath, data) {
    const yaml = typeof data === 'string' ? data : exportToYaml(data);
    await writeFile(filePath, yaml, 'utf-8');
}

// In YAML a # after a space starts a comment, so the text after it is left out of the map.
// One line for each, saying where it is and how to keep it, for validate and push to print.
export function commentWarnings(content) {
    return keepHashes(content).warnings.map(w => `line ${w.line}: "${w.text}" is read as a comment and left out. To keep it, put the value in quotes.`);
}
