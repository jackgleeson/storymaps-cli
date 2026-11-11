// Storymaps CLI — AGPL-3.0 — see LICENCE for details
// storymaps lock — password-protect one map. Locking a whole project is storymaps project lock.

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import chalk from 'chalk';
import jsyaml from 'js-yaml';
import { resolveTarget } from '../util/identity.js';
import { lockMap, getProject, getMap } from '../util/api.js';
import { findProjectFolder } from '../util/project.js';
import { askPassword, StopError, PASSWORD_ENV } from '../util/prompt.js';

// The map's name and the project it's in, from its file, or from the server for a link
async function describe(target, filePath, baseUrl, id, projectId) {
    try {
        if (!target) {
            const obj = jsyaml.load(await readFile(filePath, 'utf-8'));
            return { name: obj?.name || id, projectId: projectId || obj?.project };
        }
        const { data } = await getMap(baseUrl, id, 'json');
        return { name: data.name || id, projectId };
    } catch {
        return { name: id, projectId };
    }
}

export async function lockCommand(target, opts) {
    if (!target && !opts.file && await findProjectFolder(opts)) {
        throw new StopError('Name a map with -f. To lock the whole project, run storymaps project lock');
    }
    const filePath = resolve(opts.file || 'storymap.yml');
    let id, baseUrl, projectId;
    try {
        ({ id, baseUrl, projectId } = await resolveTarget(target, filePath));
    } catch (err) {
        if (/whole project/.test(err.message)) throw new StopError(`${err.message.split('.')[0]}. To lock the whole project, run storymaps project lock`);
        throw new StopError('No map ID found. Run "storymaps push" to create it on the server, or pass one directly: storymaps lock <id>');
    }

    // STORYMAPS_PASSWORD is the new password, so nothing is asked
    const passwordHash = await askPassword({ confirmTwice: true, noPasswordMessage: `Locking needs a password, and there's no terminal to type it in. Set ${PASSWORD_ENV} for this command.` });
    await lockMap(baseUrl, id, passwordHash);

    // In a project, say which lock the map ended up with, as the server labels it
    const map = await describe(target, filePath, baseUrl, id, projectId);
    if (map.projectId) {
        try {
            const project = await getProject(baseUrl, map.projectId);
            const label = project.maps.find(m => m.id === id)?.lock;
            if (label === 'project') return console.log(chalk.green(`Locked ${map.name} with the project password.`));
            if (label === 'map' && project.locked) return console.log(chalk.green(`Locked ${map.name} with its own password.`));
        } catch { /* fall through to the plain message */ }
    }
    console.log(chalk.green(`Locked ${map.name}.`));
}
