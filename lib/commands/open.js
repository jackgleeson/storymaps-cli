// Storymaps CLI — AGPL-3.0 — see LICENCE for details
// storymaps open — open a map in the default browser

import { exec } from 'node:child_process';
import { resolve } from 'node:path';
import chalk from 'chalk';
import { resolveTarget } from '../util/identity.js';

export async function openCommand(target, opts) {
    const filePath = resolve(opts.file || 'storymap.yml');
    let id, baseUrl;
    try {
        ({ id, baseUrl } = await resolveTarget(target, filePath));
    } catch {
        console.error(chalk.red('No map ID found. Run "storymaps new" first to reserve an ID, or pass one directly: storymaps open <id>'));
        process.exitCode = 1;
        return;
    }

    const url = `${baseUrl}/${id}`;

    const platform = process.platform;
    const cmd = platform === 'darwin' ? 'open'
        : platform === 'win32' ? 'start'
        : 'xdg-open';

    exec(`${cmd} ${url}`);
    console.log(chalk.green(url));
}
