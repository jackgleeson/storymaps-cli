// Storymaps CLI — AGPL-3.0 — see LICENCE for details
// Project folders: a folder of map files that share a project key
//
// A project lives in one folder, storymaps/ by default, so a repo gets one new folder rather than
// a file per map. Each file is an ordinary map file named by its map ID, such as
// storymaps/1g2pt83x.yml, so renaming a map in the app never puts a file out of step. There's no
// separate project file: the project name and tab order come from the server each time.
//
// The CLI never moves, renames or deletes a file, so a map open in an editor never looks
// deleted. The one exception is a map started offline whose ID turns out to be taken.

import { existsSync, statSync } from 'node:fs';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve, relative, extname, basename } from 'node:path';
import { homedir } from 'node:os';
import chalk from 'chalk';
import jsyaml from 'js-yaml';
import { siteToBaseUrl } from './identity.js';
import { StopError } from './prompt.js';

export const PROJECT_DIR = 'storymaps';
const MAP_FILE = /\.ya?ml$/i;

// A path as it reads from where the command was run, such as storymaps/1g2pt83x.yml
export const shortPath = (path) => relative(process.cwd(), path) || '.';

export const mapFilePath = (dir, mapId) => join(dir, `${mapId}.yml`);

// The map files in a folder that say which project they're in
export async function readProjectFiles(dir) {
    let names;
    try {
        names = await readdir(dir);
    } catch {
        return [];
    }
    const files = [];
    for (const name of names.sort()) {
        if (!MAP_FILE.test(name)) continue;
        const path = resolve(dir, name);
        let content, obj;
        try {
            content = await readFile(path, 'utf-8');
            obj = jsyaml.load(content);
        } catch (err) {
            // A file that names a project but can't be read is reported, never quietly skipped
            if (content && /^project:/m.test(content)) files.push({ path, name, content, broken: err.message.split('\n')[0] });
            continue;
        }
        if (!obj || typeof obj !== 'object' || !obj.project) continue;
        files.push({ path, name, content, obj, id: obj.id ? String(obj.id) : null, project: String(obj.project), site: obj.site });
    }
    return files;
}

// The folder a project is pulled or started in, when --dir doesn't say: the current folder if
// it's already a project folder (named storymaps, or holding project files), so running a
// command from inside storymaps/ never makes storymaps/storymaps/; otherwise storymaps/ in it.
export async function defaultProjectDir(dir) {
    if (dir) return resolve(dir);
    const cwd = process.cwd();
    if (existsSync(join(cwd, PROJECT_DIR))) return join(cwd, PROJECT_DIR);
    if (basename(cwd) === PROJECT_DIR || (await readProjectFiles(cwd)).length) return cwd;
    return join(cwd, PROJECT_DIR);
}

// The project folder a command works on, or null when it works on one map. A project in reach
// wins: the folder named with --dir, storymaps/ inside the current folder, or project files in the
// current folder itself, so commands work from a repo root or from inside storymaps/. With no
// project in reach, storymap.yml means one map, exactly as before projects. -f always means one map.
export async function findProjectFolder(opts = {}) {
    if (opts.file) return null;
    const candidates = opts.dir ? [opts.dir] : [PROJECT_DIR, '.'];
    for (const candidate of candidates) {
        const dir = resolve(candidate);
        if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
        const files = await readProjectFiles(dir);
        if (!files.length) continue;
        const projects = [...new Set(files.filter(f => !f.broken).map(f => f.project))];
        if (!projects.length) throw new StopError(`${files.map(f => f.name).join(', ')} in ${shortPath(dir)} can't be read: ${files[0].broken}`);
        if (projects.length > 1) {
            throw new StopError(`${shortPath(dir)} has maps from ${projects.length} projects: ${projects.join(', ')}. Use --dir for a folder with one project, or -f for one map.`);
        }
        const site = files.find(f => f.site)?.site;
        // A storymap.yml beside the project is still one -f away; say so, so it isn't missed
        const single = resolve('storymap.yml');
        if (!opts.dir && !opts.quiet && existsSync(single) && !files.some(f => f.path === single)) {
            console.log(chalk.dim(`Using the project in ${candidate === '.' ? 'this folder' : `${candidate}/`}. Add -f storymap.yml for the map in storymap.yml.`));
        }
        return { dir, files, projectId: projects[0], baseUrl: siteToBaseUrl(site), site };
    }
    // A folder named with --dir is never quietly passed over, so a typo can't look like it worked
    if (opts.dir) {
        const dir = resolve(opts.dir);
        if (!existsSync(dir)) throw new StopError(`There's no folder called ${opts.dir}.`);
        throw new StopError(`${opts.dir} has no map files from a project. Pull a project into it with storymaps pull storymaps.io/p/<project> --dir ${opts.dir}.`);
    }
    return null;
}

// Puts project: <id> straight after id: (or name:) in a file's text, replacing any it has
export function setProjectKey(content, projectId) {
    const without = removeProjectKey(content);
    if (/^id:\s.*$/m.test(without)) return without.replace(/^(id:\s.*)$/m, `$1\nproject: ${projectId}`);
    if (/^name:\s.*$/m.test(without)) return without.replace(/^(name:\s.*)$/m, `$1\nproject: ${projectId}`);
    return `project: ${projectId}\n${without}`;
}

export function removeProjectKey(content) {
    return content.replace(/^project:[^\n]*\n?/m, '');
}

// Puts id: <id> straight after name:, replacing any it has
export function setIdKey(content, id) {
    const without = content.replace(/^id:[^\n]*\n?/m, '');
    if (/^name:\s.*$/m.test(without)) return without.replace(/^(name:\s.*)$/m, `$1\nid: ${id}`);
    return `id: ${id}\n${without}`;
}

// Puts site: <site> after project: (or id:), unless the file already says its site
export function setSiteKey(content, site) {
    if (!site || /^site:\s/m.test(content)) return content;
    for (const key of ['project', 'id', 'name']) {
        const re = new RegExp(`^(${key}:\\s.*)$`, 'm');
        if (re.test(content)) return content.replace(re, `$1\nsite: ${site}`);
    }
    return `site: ${site}\n${content}`;
}

// The site a server's address stands for in a map file, such as storymaps.io or localhost:3000.
// A port is always written out.
export const siteOfBaseUrl = (baseUrl) => new URL(baseUrl).host;

// Sets locked: true or false in a map file after the CLI locks or unlocks its map, so the file
// says what the map is now. Only that line changes; the conflict check doesn't cover it.
export async function setLockedInFile(path, locked) {
    let content;
    try {
        content = await readFile(path, 'utf-8');
    } catch {
        return;
    }
    if (!/^locked:\s/m.test(content)) return;
    const updated = content.replace(/^locked:\s.*$/m, `locked: ${locked}`);
    if (updated !== content) await writeFile(path, updated, 'utf-8');
}

// After a project lock changes, the files in the folder for the maps whose lock changed
export async function updateLockedInFolder(dir, before, after) {
    if (!dir) return;
    const files = await readProjectFiles(dir);
    for (const map of after.maps) {
        const was = !!before.maps.find(m => m.id === map.id)?.lock;
        const now = !!map.lock;
        if (was === now) continue;
        const file = files.find(f => f.id === map.id);
        if (file) await setLockedInFile(file.path, now);
    }
}

export async function writeMapFile(path, content) {
    await mkdir(resolve(path, '..'), { recursive: true });
    await writeFile(path, content, 'utf-8');
}

export const isMapFile = (path) => MAP_FILE.test(extname(path) ? path : '');

// The CLI's own notes, kept in ~/.storymaps next to the conflict-check data, never in the repo:
//   newMaps: files written by project add for a map not yet on the server, so push knows to create
//            it, and can tell it from a map that was deleted
//   drafts:  files project add started a map from, so push passes over them with a reminder
const NOTES = join(homedir(), '.storymaps', 'projects.json');

async function readNotes() {
    try {
        const notes = JSON.parse(await readFile(NOTES, 'utf-8'));
        return { newMaps: notes.newMaps || {}, drafts: notes.drafts || {} };
    } catch {
        return { newMaps: {}, drafts: {} };
    }
}

async function writeNotes(notes) {
    await mkdir(join(homedir(), '.storymaps'), { recursive: true });
    await writeFile(NOTES, JSON.stringify(notes), 'utf-8');
}

export async function noteNewMap(path, id) {
    const notes = await readNotes();
    notes.newMaps[resolve(path)] = { id };
    await writeNotes(notes);
}

export async function isNewMap(path, id) {
    return (await readNotes()).newMaps[resolve(path)]?.id === id;
}

export async function forgetNewMap(path) {
    const notes = await readNotes();
    delete notes.newMaps[resolve(path)];
    await writeNotes(notes);
}

export async function noteDraft(draftPath, newPath) {
    const notes = await readNotes();
    notes.drafts[resolve(draftPath)] = { file: resolve(newPath) };
    await writeNotes(notes);
}

// The file a draft became, or null
export async function draftOf(path) {
    return (await readNotes()).drafts[resolve(path)]?.file || null;
}
