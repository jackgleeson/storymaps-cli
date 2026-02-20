// Storymaps CLI — AGPL-3.0 — see LICENCE for details
// File I/O utilities for reading/writing storymap files

import { readFile, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';
import jsyaml from 'js-yaml';
import { exportToYaml } from '../core/yaml.js';

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
