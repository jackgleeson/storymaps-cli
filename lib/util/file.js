// Storymaps CLI — AGPL-3.0 — see LICENCE for details
// File I/O utilities for reading/writing storymap files

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, basename, join, extname } from 'node:path';
import jsyaml from 'js-yaml';
import { exportToYaml } from '../core/yaml.js';

const CACHE_DIR = join(homedir(), '.storymaps', 'caches');

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
    return jsyaml.load(content);
}

export async function writeStorymap(filePath, data) {
    const yaml = typeof data === 'string' ? data : exportToYaml(data);
    await writeFile(filePath, yaml, 'utf-8');
}
