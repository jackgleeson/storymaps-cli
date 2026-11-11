// Storymaps CLI — AGPL-3.0 — see LICENCE for details
// storymaps project init, add, lock and unlock: the commands that change a project itself.
// Renaming a project, and reordering, removing and deleting its maps, stay in the app.

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import chalk from 'chalk';
import jsyaml from 'js-yaml';
import { importFromYaml } from '../core/yaml.js';
import { generateId } from '../core/constants.js';
import {
    getMap, postMap, getProject, createProject, addProjectMap, mapExists, lockProject,
    removeProjectLock, checkProjectPassword, ApiError,
} from '../util/api.js';
import { writeEtag, writeCache } from '../util/file.js';
import { resolveTarget, parseProjectLink, siteToBaseUrl } from '../util/identity.js';
import {
    PROJECT_DIR, defaultProjectDir, findProjectFolder, readProjectFiles, mapFilePath, shortPath, setIdKey, setProjectKey,
    writeMapFile, noteNewMap, noteDraft, setSiteKey, siteOfBaseUrl,
} from '../util/project.js';
import { projectPassword, rememberProjectPassword, forgetProjectPassword, listNames } from '../util/passwords.js';
import { askPassword, choose, ask, StopError, PASSWORD_ENV } from '../util/prompt.js';
import { projectLink, reportLock } from './project-sync.js';
import { template } from './init.js';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const NEW_MAP_WAIT = 61_000;

// Makes a map on the server, waiting a minute if the limit of 10 new maps a minute is reached
async function createMap(baseUrl, content) {
    try {
        return (await postMap(baseUrl, content, 'text/yaml')).id;
    } catch (err) {
        if (!(err instanceof ApiError && err.status === 429)) throw err;
        console.log(chalk.dim('The server makes 10 new maps a minute, so this waits a minute...'));
        await new Promise(r => setTimeout(r, NEW_MAP_WAIT));
        return (await postMap(baseUrl, content, 'text/yaml')).id;
    }
}

// Writes a map in the project to the folder, as the server exports it with its project key
async function writeFromServer(baseUrl, projectId, mapId, dir) {
    const path = mapFilePath(dir, mapId);
    const { data, etag } = await getMap(baseUrl, mapId, 'yaml', { project: projectId });
    await writeMapFile(path, data);
    await writeEtag(mapId, path, etag);
    return path;
}

const readMapFile = async (file) => {
    const content = await readFile(resolve(file), 'utf-8');
    importFromYaml(content);
    return { content, obj: jsyaml.load(content) };
};

// ---------------------------------------------------------------------------------------------
// project init

// Starts a project with a first map, or with a map from each file, written to storymaps/ by ID.
// The original files are left alone. Needs a connection, as the server makes projects.
export async function projectInitCommand(files, opts) {
    const dir = await defaultProjectDir(opts.dir);
    const existing = await readProjectFiles(dir);
    if (existing.length) {
        throw new StopError(`${shortPath(dir)} already holds a project, ${existing[0].project}. Use --dir for the new one.`);
    }
    const baseUrl = siteToBaseUrl(opts.site);
    const sources = [];
    for (const file of files) {
        try {
            sources.push({ file, ...(await readMapFile(file)) });
        } catch (err) {
            throw new StopError(`${file} isn't a valid map:\n${err.message}\nNothing was created.`);
        }
    }
    if (!sources.length) sources.push({ content: template(opts.site), obj: { name: 'My Story Map' } });

    // A project needs at least one map, so the maps come first
    const ids = [];
    for (const source of sources) ids.push(await createMap(baseUrl, source.content.replace(/^id:[^\n]*\n?/m, '').replace(/^project:[^\n]*\n?/m, '')));
    const project = await createProject(baseUrl, ids, opts.name);

    console.log(chalk.green(`Created project ${project.name}: ${projectLink(baseUrl, project.id)}`));
    const width = Math.max(...project.maps.map(m => m.name.length));
    for (const map of project.maps) console.log(`  ${map.name.padEnd(width)}  ${projectLink(baseUrl, project.id, map.id)}`);
    const written = [];
    for (const id of ids) written.push(shortPath(await writeFromServer(baseUrl, project.id, id, dir)));
    console.log(`Wrote ${listNames(written)}`);
    if (files.length) console.log(chalk.dim(`${listNames(files)} ${files.length === 1 ? 'is' : 'are'} unchanged. Delete ${files.length === 1 ? 'it' : 'them'} when you're ready.`));
}

// ---------------------------------------------------------------------------------------------
// project add

// The project to add to: the project folder, or --project when there isn't one yet
async function projectToChange(opts) {
    if (opts.project) {
        const link = parseProjectLink(opts.project);
        const projectId = link ? link.projectId : opts.project;
        const baseUrl = link ? link.baseUrl : siteToBaseUrl();
        return { projectId, baseUrl, dir: await defaultProjectDir(opts.dir) };
    }
    const ctx = await findProjectFolder({ dir: opts.dir, quiet: true });
    if (!ctx?.projectId) {
        throw new StopError('There\'s no project here. Run this in a project folder, or say which project with --project storymaps.io/p/<project>.');
    }
    return ctx;
}

const isOffline = (err) => err instanceof TypeError || err?.cause?.code === 'ENOTFOUND' || err?.cause?.code === 'ECONNREFUSED' || err?.code === 'ENOTFOUND';

// Adds a new blank map, a new map from a file that isn't on storymaps.io, or an existing map,
// by its file, link or ID. Online, the map is created and added straight away. Offline, the CLI
// makes the map ID and the next push creates the map and adds it.
export async function projectAddCommand(source, opts) {
    const { projectId, baseUrl, dir } = await projectToChange(opts);

    // What's being added
    let existingId = null, content = null, name = opts.name || 'My Story Map', draft = null;
    if (source && /\.ya?ml$/i.test(source)) {
        let read;
        try {
            read = await readMapFile(source);
        } catch (err) {
            throw new StopError(`${source} isn't a valid map:\n${err.message}`);
        }
        name = read.obj.name || name;
        const id = read.obj.id ? String(read.obj.id) : null;
        const exists = id ? await mapExists(baseUrl, id).catch(err => { if (isOffline(err)) return null; throw err; }) : false;
        if (exists === true) existingId = id;
        else {
            content = read.content;
            draft = resolve(source);
        }
    } else if (source) {
        existingId = (await resolveTarget(source)).id;
    } else {
        content = template().replace(/^name: My Story Map$/m, jsyaml.dump({ name }).trim());
    }

    let project;
    try {
        project = await getProject(baseUrl, projectId);
    } catch (err) {
        if (existingId || !isOffline(err)) throw err;
        return addOffline({ baseUrl, projectId, dir, content, name, draft });
    }
    if (existingId) name = (await getMap(baseUrl, existingId, 'json')).data.name || 'this map';
    const hash = await projectPassword(baseUrl, project, `${project.name} is locked. Enter its password to add ${name}`);

    let id = existingId;
    if (!id) {
        const body = content.replace(/^id:[^\n]*\n?/m, '').replace(/^project:[^\n]*\n?/m, '');
        id = await createMap(baseUrl, body);
        console.log(chalk.green(`Created ${name}: ${projectLink(baseUrl, projectId, id)}`));
    }
    const after = await addProjectMap(baseUrl, projectId, id, hash || undefined);
    const map = after.maps.find(m => m.id === id);
    console.log(chalk.green(`Added ${map?.name || name} to ${project.name}.`));
    reportLock(map?.name || name, map);
    const path = await writeFromServer(baseUrl, projectId, id, dir);
    console.log(`Wrote ${shortPath(path)}`);
    if (draft) {
        await noteDraft(draft, path);
        console.log(chalk.dim(`${shortPath(draft)} is unchanged. Delete it when you're ready.`));
    } else if (source && /\.ya?ml$/i.test(source)) {
        console.log(chalk.dim(`${shortPath(resolve(source))} is unchanged. Delete it when you're ready.`));
    }
}

// With no connection: the CLI makes the ID and writes the file; the next push creates the map
async function addOffline({ baseUrl, projectId, dir, content, name, draft }) {
    const id = generateId();
    const path = mapFilePath(dir, id);
    await writeMapFile(path, setSiteKey(setProjectKey(setIdKey(content, id), projectId), siteOfBaseUrl(baseUrl)));
    await noteNewMap(path, id);
    if (draft) await noteDraft(draft, path);
    console.log(`Wrote ${shortPath(path)}`);
    console.log(chalk.yellow(`You're offline, so ${name} will be created and added to the project on your next push.`));
    if (draft) console.log(chalk.dim(`${shortPath(draft)} is unchanged. Delete it when you're ready.`));
    return { baseUrl };
}

// ---------------------------------------------------------------------------------------------
// project lock

// The same two choices as the app: the project, or the project and its maps that aren't locked
export async function projectLockCommand(opts) {
    const { projectId, baseUrl } = await projectToChange(opts);
    const project = await getProject(baseUrl, projectId);
    const unlocked = project.maps.filter(m => !m.lock);
    const keeping = project.maps.filter(m => m.lock === 'map').map(m => m.name);
    const keepNote = keeping.length ? `${listNames(keeping)} ${keeping.length === 1 ? 'keeps its own lock.' : 'keep their own locks.'}` : '';

    if (project.locked) {
        if (!opts.maps) {
            console.log(`${project.name} is already locked.` + (unlocked.length ? chalk.dim(` To lock its ${plural(unlocked.length, 'unlocked map')} too, run storymaps project lock --maps`) : ''));
            return;
        }
        if (!unlocked.length) {
            console.log(chalk.dim(`${project.name} and its maps are already locked.`));
            return;
        }
        if (!process.env[PASSWORD_ENV]) console.log(chalk.yellow(`${project.name} is already locked. Enter its password to lock its unlocked maps.`));
        const hash = await askPassword({ noPasswordMessage: `${project.name} is locked, and there's no terminal to type its password in. Set ${PASSWORD_ENV} for this command.` });
        const result = await lockProject(baseUrl, projectId, hash, true);
        const nowLocked = result.project.maps.filter(m => m.lock === 'project' && unlocked.some(u => u.id === m.id)).map(m => m.name);
        console.log(chalk.green(`Locked ${listNames(nowLocked)} with the project password.`) + chalk.dim(' Every other map was already locked.'));
        return;
    }

    const withMaps = opts.maps || await choose({
        message: 'What should the password lock?',
        yes: opts.yes,
        defaultValue: false,
        choices: [
            { name: 'The project', value: false, description: 'Nobody can rename the project, or add, remove or reorder its maps, without the password. What\'s on each map can still be edited.' },
            ...(unlocked.length ? [{
                name: `The project and its ${plural(unlocked.length, keeping.length ? 'unlocked map' : 'map')}`,
                value: true,
                description: `Nobody can edit ${unlocked.length === 1 ? 'that map' : 'those maps'} without the password either, and ${unlocked.length === 1 ? 'it' : 'each one'} can be unlocked on its own later. ${keepNote}`.trim(),
            }] : []),
        ],
    });
    const hash = await askPassword({ confirmTwice: true, noPasswordMessage: `Locking needs a password, and there's no terminal to type it in. Set ${PASSWORD_ENV} for this command.` });
    const result = await lockProject(baseUrl, projectId, hash, withMaps);
    await rememberProjectPassword(projectId, hash);
    // Said from the labels after locking: a map locked before with this same password now counts
    // as locked with the project password, not with its own
    const lockedMaps = withMaps ? result.project.maps.filter(m => m.lock === 'project' && unlocked.some(u => u.id === m.id)).length : 0;
    const ownAfter = result.project.maps.filter(m => m.lock === 'map').map(m => m.name);
    const ownNote = ownAfter.length ? `${listNames(ownAfter)} ${ownAfter.length === 1 ? 'keeps its own lock.' : 'keep their own locks.'}` : '';
    console.log(chalk.green(`Locked ${project.name}${lockedMaps ? ` and its ${plural(lockedMaps, keeping.length ? 'unlocked map' : 'map')}` : ''}.`) + (ownNote ? chalk.dim(` ${ownNote}`) : ''));
}

// ---------------------------------------------------------------------------------------------
// project unlock

// On this computer, as entering the password in the app does, or for everyone with --remove.
// Both ask about the maps that use the project password, defaulting to no as the app does.
export async function projectUnlockCommand(opts) {
    const { projectId, baseUrl, dir } = await projectToChange(opts);
    const project = await getProject(baseUrl, projectId);
    if (!project.locked) {
        console.log(chalk.dim(`${project.name} isn't locked.`));
        return;
    }
    const shared = project.maps.filter(m => m.lock === 'project');
    const own = project.maps.filter(m => m.lock === 'map');

    if (opts.remove) {
        console.log(chalk.yellow(`Anyone with the link will be able to change the name, maps and order of ${project.name}, and delete it.`));
        const hash = await askPassword({ noPasswordMessage: `Removing the lock needs the ${project.name} password, and there's no terminal to type it in. Set ${PASSWORD_ENV} for this command.` });
        const removeMaps = shared.length ? (opts.maps || await ask({ message: `Also remove the lock from ${plural(shared.length, 'map')}? ${shared.length === 1 ? 'It has' : 'They have'} a project lock.`, yes: opts.yes })) : false;
        try {
            await removeProjectLock(baseUrl, projectId, hash, removeMaps);
        } catch (err) {
            if (err instanceof ApiError && err.status === 403) throw new StopError('Incorrect password. Nothing was changed.');
            throw err;
        }
        await forgetProjectPassword(projectId);
        if (removeMaps) for (const map of shared) await writeCache(map.id, { hash: null });
        console.log(removeMaps
            ? chalk.green(`Removed the lock from ${project.name} and ${plural(shared.length, 'map')}.`)
            : chalk.green(`Removed the lock from ${project.name}.`) + (shared.length ? chalk.dim(' Its maps keep their locks.') : ''));
        return;
    }

    const hash = await askPassword({ noPasswordMessage: `Unlocking needs the ${project.name} password, and there's no terminal to type it in. Set ${PASSWORD_ENV} for this command.` });
    try {
        await checkProjectPassword(baseUrl, projectId, hash);
    } catch (err) {
        if (err instanceof ApiError && err.status === 403) throw new StopError('Incorrect password.');
        throw err;
    }
    await rememberProjectPassword(projectId, hash);
    const withMaps = shared.length ? (opts.maps || await ask({ message: `Also unlock the ${plural(shared.length, 'map')} locked with the project password, on this computer?`, yes: opts.yes })) : false;
    if (withMaps) {
        for (const map of shared) await writeCache(map.id, { hash });
        console.log(chalk.green(`Unlocked ${project.name} and ${plural(shared.length, 'map')} on this computer.`));
    } else {
        console.log(chalk.green(`Unlocked ${project.name} on this computer.`) + (shared.length ? chalk.dim(' Its maps stay locked. Add --maps to unlock them too.') : ''));
    }
    for (const map of own) {
        const file = shortPath(mapFilePath(dir, map.id));
        console.log(chalk.dim(`${map.name} is still locked. To unlock it, run`) + ` ${chalk.cyan(`storymaps unlock -f ${file}`)}`);
    }
}
