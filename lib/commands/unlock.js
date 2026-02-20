// Storymaps CLI — AGPL-3.0 — see LICENCE for details
// storymaps unlock — session unlock or permanently remove a map lock

import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { password } from '@inquirer/prompts';
import chalk from 'chalk';
import { resolveTarget } from '../util/identity.js';
import { unlockMap, removeLock } from '../util/api.js';
import { writeCache } from '../util/file.js';

export async function unlockCommand(target, opts) {
    const filePath = resolve(opts.file || 'storymap.yml');
    let id, baseUrl;
    try {
        ({ id, baseUrl } = await resolveTarget(target, filePath));
    } catch {
        console.error(chalk.red('No map ID found. Run "storymaps new" first to reserve an ID, or pass one directly: storymaps unlock <id>'));
        process.exitCode = 1;
        return;
    }

    const pw = await password({ theme: { prefix: '>' }, message: 'Password:' });
    const passwordHash = createHash('sha256').update(pw).digest('hex');

    if (opts.remove) {
        await removeLock(baseUrl, id, passwordHash);
        await writeCache(id, { hash: null });
        console.log(chalk.green(`Lock removed from map ${id}.`));
    } else {
        await unlockMap(baseUrl, id, passwordHash);
        await writeCache(id, { hash: passwordHash });
        console.log(chalk.green(`Map ${id} unlocked.`));
    }
}
