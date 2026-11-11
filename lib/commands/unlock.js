// Storymaps CLI — AGPL-3.0 — see LICENCE for details
// storymaps unlock — unlock one map on this computer, or remove its lock.
// Unlocking a whole project is storymaps project unlock.

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import chalk from 'chalk';
import jsyaml from 'js-yaml';
import { resolveTarget } from '../util/identity.js';
import { unlockMap, removeLock, ApiError } from '../util/api.js';
import { writeCache } from '../util/file.js';
import { findProjectFolder } from '../util/project.js';
import { askPassword, StopError, PASSWORD_ENV } from '../util/prompt.js';

export async function unlockCommand(target, opts) {
    if (!target && !opts.file && await findProjectFolder(opts)) {
        throw new StopError('Name a map with -f. To unlock the whole project, run storymaps project unlock');
    }
    const filePath = resolve(opts.file || 'storymap.yml');
    let id, baseUrl;
    try {
        ({ id, baseUrl } = await resolveTarget(target, filePath));
    } catch (err) {
        if (/whole project/.test(err.message)) throw new StopError(`${err.message.split('.')[0]}. To unlock the whole project, run storymaps project unlock`);
        throw new StopError('No map ID found. Run "storymaps push" to create it on the server, or pass one directly: storymaps unlock <id>');
    }
    let name = id;
    if (!target) {
        try {
            name = jsyaml.load(await readFile(filePath, 'utf-8'))?.name || id;
        } catch { /* no file */ }
    }

    const passwordHash = await askPassword({ noPasswordMessage: `Unlocking needs the password, and there's no terminal to type it in. Set ${PASSWORD_ENV} for this command.` });
    try {
        if (opts.remove) {
            await removeLock(baseUrl, id, passwordHash);
            await writeCache(id, { hash: null });
            console.log(chalk.green(`Removed the lock from ${name}.`));
        } else {
            await unlockMap(baseUrl, id, passwordHash);
            await writeCache(id, { hash: passwordHash });
            console.log(chalk.green(`Unlocked ${name} on this computer.`));
        }
    } catch (err) {
        if (err instanceof ApiError && err.status === 403) throw new StopError('Incorrect password.');
        throw err;
    }
}
