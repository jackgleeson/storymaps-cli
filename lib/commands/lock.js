// Storymaps CLI — AGPL-3.0 — see LICENCE for details
// storymaps lock — password-protect a map

import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { password } from '@inquirer/prompts';
import chalk from 'chalk';
import { resolveTarget } from '../util/identity.js';
import { lockMap } from '../util/api.js';

export async function lockCommand(target, opts) {
    const filePath = resolve(opts.file || 'storymap.yml');
    let id, baseUrl;
    try {
        ({ id, baseUrl } = await resolveTarget(target, filePath));
    } catch {
        console.error(chalk.red('No map ID found. Run "storymaps new" first to reserve an ID, or pass one directly: storymaps lock <id>'));
        process.exitCode = 1;
        return;
    }

    const pw = await password({ theme: { prefix: '>' }, message: 'Password:' });
    const pw2 = await password({ theme: { prefix: '>' }, message: 'Confirm password:' });

    if (pw !== pw2) {
        console.error(chalk.red('Passwords do not match.'));
        process.exitCode = 1;
        return;
    }

    const passwordHash = createHash('sha256').update(pw).digest('hex');
    await lockMap(baseUrl, id, passwordHash);
    console.log(chalk.green(`Map ${id} is now locked.`));
}
