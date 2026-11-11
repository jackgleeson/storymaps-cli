// Storymaps CLI — AGPL-3.0 — see LICENCE for details
// Passwords for a project and the maps in it, each checked with the server before anything is sent
//
// A password is tried in this order: remembered on this computer after an unlock, then
// STORYMAPS_PASSWORD, then typed in a terminal. Across a whole project, STORYMAPS_PASSWORD is only
// tried on the project and the maps locked with its password: a map with its own lock is never
// sent a guess that would count against the limit on wrong passwords.

import chalk from 'chalk';
import { readCache, writeCache } from './file.js';
import { askPassword, envPasswordHash, isInteractive, StopError, PASSWORD_ENV } from './prompt.js';
import { checkProjectPassword, unlockMap, ApiError } from './api.js';

const projectKey = (projectId) => `project-${projectId}`;

export async function rememberProjectPassword(projectId, hash) {
    await writeCache(projectKey(projectId), { hash });
}

export async function forgetProjectPassword(projectId) {
    await writeCache(projectKey(projectId), { hash: null });
}

const wrongPassword = (err) => err instanceof ApiError && err.status === 403;

async function projectPasswordWorks(baseUrl, projectId, hash) {
    try {
        await checkProjectPassword(baseUrl, projectId, hash);
        return true;
    } catch (err) {
        if (wrongPassword(err)) return false;
        throw err;
    }
}

async function mapPasswordWorks(baseUrl, mapId, hash) {
    try {
        await unlockMap(baseUrl, mapId, hash);
        return true;
    } catch (err) {
        if (wrongPassword(err)) return false;
        throw err;
    }
}

// The project password, or null when the project isn't locked. reason is what the password is
// for, such as "Storymaps.io is locked. Enter its password to add Roadmap".
export async function projectPassword(baseUrl, project, reason) {
    if (!project.locked) return null;
    const saved = (await readCache(projectKey(project.id))).hash;
    if (saved && await projectPasswordWorks(baseUrl, project.id, saved)) return saved;

    const fromEnv = envPasswordHash();
    if (fromEnv) {
        if (await projectPasswordWorks(baseUrl, project.id, fromEnv)) return fromEnv;
        throw new StopError(`${PASSWORD_ENV} isn't the password for ${project.name}. Nothing was changed.`);
    }
    if (!isInteractive()) {
        throw new StopError(`${reason.replace(/\. Enter its password.*$/, '')}, and there's no terminal to type its password in. Nothing was changed. Run storymaps project unlock --maps in a terminal first, or set ${PASSWORD_ENV} for this command.`);
    }
    console.log(chalk.yellow(`${reason}.`));
    const hash = await askPassword({ allowEnv: false });
    if (!await projectPasswordWorks(baseUrl, project.id, hash)) throw new StopError('Incorrect password. Nothing was changed.');
    return hash;
}

// The password of a map with its own lock, across a whole project: remembered, or typed
export async function ownMapPassword(baseUrl, map, file) {
    const saved = (await readCache(map.id)).hash;
    if (saved && await mapPasswordWorks(baseUrl, map.id, saved)) return saved;
    const unlockHint = file ? `storymaps unlock -f ${file}` : `storymaps unlock ${map.id}`;
    if (!isInteractive()) {
        throw new StopError(`${map.name} has its own lock, and there's no terminal to type its password in. Nothing was changed. Run ${unlockHint} in a terminal first.`);
    }
    console.log(chalk.yellow(`${map.name} has its own lock.`));
    const hash = await askPassword({ allowEnv: false });
    if (!await mapPasswordWorks(baseUrl, map.id, hash)) throw new StopError(`Incorrect password for ${map.name}. Nothing was changed.`);
    return hash;
}

// The password for one map, outside a whole-project command: remembered, STORYMAPS_PASSWORD, or typed
export async function singleMapPassword(baseUrl, mapId) {
    const saved = (await readCache(mapId)).hash;
    if (saved && await mapPasswordWorks(baseUrl, mapId, saved)) return saved;
    const fromEnv = envPasswordHash();
    if (fromEnv) {
        if (await mapPasswordWorks(baseUrl, mapId, fromEnv)) return fromEnv;
        throw new StopError(`${PASSWORD_ENV} isn't the password for this map. Nothing was changed.`);
    }
    if (!isInteractive()) {
        throw new StopError(`This map is locked, and there's no terminal to type its password in. Nothing was changed. Run storymaps unlock in a terminal first, or set ${PASSWORD_ENV} for this command.`);
    }
    console.log(chalk.yellow('Map is locked.'));
    const hash = await askPassword({ allowEnv: false });
    if (!await mapPasswordWorks(baseUrl, mapId, hash)) throw new StopError('Incorrect password. Nothing was changed.');
    return hash;
}

// Lists names as "A", "A and B", or "A, B and C"
export const listNames = (names) => names.length <= 1 ? (names[0] || '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
