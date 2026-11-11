// Storymaps CLI — AGPL-3.0 — see LICENCE for details
// storymaps open — open a map in the default browser

import { exec } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import jsyaml from 'js-yaml';
import { resolve } from 'node:path';
import chalk from 'chalk';
import { resolveTarget } from '../util/identity.js';
import { findProjectFolder } from '../util/project.js';
import { openProject } from './project-sync.js';

export async function openCommand(target, opts) {
    // A project folder opens the project at its first map
    if (!target) {
        const ctx = await findProjectFolder(opts);
        if (ctx?.projectId) {
            await openProject(ctx);
            return;
        }
    }
    const filePath = resolve(opts.file || 'storymap.yml');
    let id, baseUrl, projectId;
    try {
        ({ id, baseUrl, projectId } = await resolveTarget(target, filePath));
    } catch {
        console.error(chalk.red('No map ID found. Run "storymaps push" to create it on the server, or pass one directly: storymaps open <id>'));
        process.exitCode = 1;
        return;
    }

    // A map in a project opens at its project link, with the project's tabs
    if (!projectId && !target) {
        try {
            projectId = jsyaml.load(await readFile(filePath, 'utf-8'))?.project;
        } catch { /* no file */ }
    }
    const url = projectId ? `${baseUrl}/p/${projectId}/${id}` : `${baseUrl}/${id}`;

    const platform = process.platform;
    const cmd = platform === 'darwin' ? 'open'
        : platform === 'win32' ? 'start'
        : 'xdg-open';

    exec(`${cmd} ${url}`);
    console.log(chalk.green(url));
}
