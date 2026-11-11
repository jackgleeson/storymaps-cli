// Storymaps CLI — AGPL-3.0 — see LICENCE for details
// The commands that work on maps, run on every map in a project folder: pull, push, status,
// diff, backup, backups, restore and open

import { existsSync } from 'node:fs';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { exec } from 'node:child_process';
import { basename } from 'node:path';
import chalk from 'chalk';
import { diffLines } from 'diff';
import { printFullDiff } from '../util/full-diff.js';
import jsyaml from 'js-yaml';
import { exportToYaml, importFromYaml, yamlObjToJson } from '../core/yaml.js';
import {
    getMap, putMap, getProject, addProjectMap, mapExists, getNewId, createBackup, listBackups, ApiError,
} from '../util/api.js';
import { readEtag, writeEtag } from '../util/file.js';
import { changeSummary } from '../util/summary.js';
import { formatTime } from '../util/time.js';
import {
    readProjectFiles, mapFilePath, shortPath, removeProjectKey, setIdKey, writeMapFile,
    isNewMap, forgetNewMap, draftOf, siteOfBaseUrl,
} from '../util/project.js';
import { projectPassword, ownMapPassword, listNames } from '../util/passwords.js';
import { guard, StopError } from '../util/prompt.js';
import { storyCounts, bar, pct } from './status.js';

const normalise = (yaml) => exportToYaml(yamlObjToJson(jsyaml.load(yaml)));
export const projectLink = (baseUrl, projectId, mapId) => `${baseUrl}/p/${projectId}${mapId ? `/${mapId}` : ''}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const pad = (text, width) => text + ' '.repeat(Math.max(0, width - text.length));
const indent = (lines) => lines.map(l => `  ${l}`);

// Lines describing what changed between two versions of a map
function summaryLines(oldYaml, newYaml) {
    const lines = changeSummary(oldYaml, newYaml);
    if (lines.length) return indent(lines);
    return [chalk.yellow(`    ~ changes not shown in summary, run ${chalk.cyan('storymaps diff --full')} to see them`)];
}

// ---------------------------------------------------------------------------------------------
// pull

// Pulls every map in a project, or one map of it, into a project folder
export async function pullProject({ baseUrl, projectId, dir, force, mapId }) {
    const project = await getProject(baseUrl, projectId);
    const all = await readProjectFiles(dir);
    for (const f of all.filter(f => f.broken)) console.log(chalk.yellow(`${f.name} can't be read as YAML, so it was left alone: ${f.broken}`));
    const local = all.filter(f => !f.broken);
    const other = local.find(f => f.project !== projectId);
    if (other) {
        throw new StopError(`${shortPath(dir)} already holds another project, ${other.project}. Use --dir to pull this one into another folder.`);
    }
    const byId = new Map(local.filter(f => f.id).map(f => [f.id, f]));
    const maps = mapId ? project.maps.filter(m => m.id === mapId) : project.maps;
    if (mapId && !maps.length) throw new StopError(`That map isn't in ${project.name}.`);
    const firstTime = !local.length;

    const plan = [];
    for (const map of maps) {
        const { data, etag } = await getMap(baseUrl, map.id, 'yaml', { project: projectId });
        const existing = byId.get(map.id);
        const path = existing?.path || mapFilePath(dir, map.id);
        if (!existing && all.some(f => f.broken && f.path === path)) continue;
        if (!existing && !existsSync(path)) {
            plan.push({ map, path, data, etag, kind: 'new' });
            continue;
        }
        const old = existing ? existing.content : await readFile(path, 'utf-8');
        // Only the lines at the top differ, such as locked after a lock: updated without asking
        let kind = old === data ? 'same' : 'changed';
        if (kind === 'changed') {
            try {
                if (normalise(old) === normalise(data)) kind = 'refresh';
            } catch { /* not readable as a map, so it's a change */ }
        }
        plan.push({ map, path, data, etag, old, kind });
    }
    // Maps taken out of the project in the app keep their files, without the project key, so a
    // later push can't put them back by accident
    const removed = mapId ? [] : local.filter(f => f.id && !project.maps.some(m => m.id === f.id));

    // One map of the project: a short message, with the same question before overwriting
    if (mapId) {
        const [p] = plan;
        if (p.kind === 'same' || p.kind === 'refresh') {
            if (p.kind === 'refresh') await writeMapFile(p.path, p.data);
            await writeEtag(p.map.id, p.path, p.etag);
            console.log(chalk.dim('Already up to date.'));
            return project;
        }
        if (p.kind === 'changed') {
            try {
                indent(changeSummary(normalise(p.old), normalise(p.data))).forEach(l => console.log(l.slice(2)));
            } catch { /* the summary is a courtesy */ }
            const ok = await guard({ message: 'Apply changes?', force, stopMessage: `${shortPath(p.path)} was left as it is.` });
            if (!ok) {
                console.log('Aborted.');
                return project;
            }
        }
        await writeMapFile(p.path, p.data);
        await writeEtag(p.map.id, p.path, p.etag);
        console.log(chalk.green(`Pulled ${p.map.name} into ${shortPath(p.path)}`));
        return project;
    }

    const fileWidth = Math.max(0, ...plan.map(p => basename(p.path).length), ...removed.map(f => f.name.length));
    const nameWidth = Math.max(0, ...plan.map(p => p.map.name.length));
    const fileName = (path) => pad(basename(path), fileWidth);
    const changed = plan.filter(p => p.kind === 'changed');
    const added = plan.filter(p => p.kind === 'new');

    if (firstTime) {
        console.log(`${project.name}: ${plural(maps.length, 'map')} into ${shortPath(dir) === '.' ? 'this folder' : `${shortPath(dir)}/`}`);
    } else {
        const parts = [plural(project.maps.length, 'map')];
        if (changed.length) parts.push(`${changed.length} changed`);
        if (!firstTime && added.length) parts.push(`${added.length} new`);
        if (removed.length) parts.push(`${removed.length} removed`);
        console.log(`${project.name}: ${parts.join(', ')}`);
    }
    for (const p of plan) {
        if (p.kind === 'same' || p.kind === 'refresh') continue;
        console.log(`  ${fileName(p.path)}  ${pad(p.map.name, nameWidth)}  ${p.kind === 'new' ? chalk.green(firstTime ? 'new' : 'new, added in the app') : ''}`.trimEnd());
        if (p.kind === 'changed') {
            try {
                summaryLines(normalise(p.old), normalise(p.data)).forEach(l => console.log(l));
            } catch { /* the summary is a courtesy */ }
        }
    }

    for (const f of removed) {
        const exists = await mapExists(baseUrl, f.id).catch(() => null);
        console.log(`  ${pad(f.name, fileWidth)}  ${f.obj.name || f.id}  ${chalk.yellow('removed from the project in the app')}`);
        console.log(chalk.dim('    The file stays, without its project key.'));
        if (exists === true) console.log(chalk.dim(`    The map is still at ${baseUrl}/${f.id}`));
        else if (exists === 'deleted') console.log(chalk.dim('    The map was deleted on the server.'));
    }

    if (changed.length) {
        const ok = await guard({ message: 'Apply changes?', force, stopMessage: 'Nothing was written.' });
        if (!ok) {
            console.log('Aborted.');
            return;
        }
    }

    for (const p of [...added, ...changed, ...plan.filter(p => p.kind === 'refresh')]) {
        await writeMapFile(p.path, p.data);
        await writeEtag(p.map.id, p.path, p.etag);
    }
    for (const p of plan.filter(p => p.kind === 'same')) await writeEtag(p.map.id, p.path, p.etag);
    for (const f of removed) await writeFile(f.path, removeProjectKey(f.content), 'utf-8');

    const written = added.length + changed.length;
    const same = plan.length - written;
    if (written) console.log(chalk.green(`Pulled ${plural(written, 'map')} from ${projectLink(baseUrl, projectId)}`) + (same ? chalk.dim(`. ${same} already up to date.`) : ''));
    else console.log(chalk.dim(`Already up to date: ${plural(same, 'map')}.`));
    return project;
}

// ---------------------------------------------------------------------------------------------
// push

// Checks every file, conflict and password before sending anything, then pushes only the maps
// that changed. Push adds a map to the project only when it creates that map: a map started with
// storymaps project add that isn't on the server yet.
export async function pushProject(ctx, { force }) {
    const { baseUrl, projectId, dir } = ctx;
    const project = await getProject(baseUrl, projectId);
    const inProject = new Map(project.maps.map(m => [m.id, m]));
    console.log(`Checking ${plural(ctx.files.length, 'map')}...`);

    const toPush = [], toCreate = [], skipped = [], drafts = [], problems = [];
    let unchanged = 0;
    for (const file of ctx.files) {
        if (file.broken) {
            problems.push(`${file.name} can't be read as YAML: ${file.broken}\nNothing was pushed.`);
            continue;
        }
        const label = file.obj.name || file.name;
        if (!file.id) {
            const became = await draftOf(file.path);
            if (became) {
                drafts.push({ file, became });
                continue;
            }
            problems.push(`${file.name} isn't on ${siteOfBaseUrl(baseUrl)} yet.\nNothing was pushed. To add it to ${project.name} as a new map, run\n${chalk.cyan(`storymaps project add ${shortPath(file.path)}`)}`);
            continue;
        }
        try {
            importFromYaml(file.content);
        } catch (err) {
            problems.push(`${file.name} isn't a valid map:\n${err.message}`);
            continue;
        }
        // A map started with project add is only ever created, never pushed over a map that
        // already has its ID, whichever map that is
        const isNew = await isNewMap(file.path, file.id);
        if (inProject.has(file.id) && !isNew) {
            const { data, etag } = await getMap(baseUrl, file.id, 'yaml', { project: projectId });
            if (normalise(data) === normalise(file.content)) {
                unchanged++;
                await writeEtag(file.id, file.path, etag);
                continue;
            }
            const name = inProject.get(file.id).name;
            const known = await readEtag(file.id, file.path);
            // A file this computer never pulled, such as one from a fresh clone of a repo, can't
            // show whether the map changed on the server since it was written
            if (!force && !known) {
                throw new StopError(`${name} hasn't been pulled on this computer, so it can't tell whether the map changed on the server since ${file.name} was written.\nNothing was pushed. Run ${chalk.cyan('storymaps pull')} first, or use ${chalk.cyan('--force')} to overwrite.`);
            }
            if (!force && known !== etag) {
                throw new StopError(`Conflict: ${name} has changed on the server since you last pulled.\nNothing was pushed. Run ${chalk.cyan('storymaps pull')} to update, or use ${chalk.cyan('--force')} to overwrite.`);
            }
            toPush.push({ file, map: inProject.get(file.id), remote: data, etag: force ? undefined : known });
            continue;
        }
        const exists = await mapExists(baseUrl, file.id);
        if (exists === true) {
            if (isNew) toCreate.push({ file, label, taken: true });
            else skipped.push({ file, label, why: `not in ${project.name}, skipped`, hint: `To add it to the project, run ${chalk.cyan(`storymaps project add ${shortPath(file.path)}`)}` });
        } else if (isNew) {
            toCreate.push({ file, label });
        } else {
            skipped.push({ file, label, why: 'no longer on the server, skipped', hint: `It may have been deleted. To start a new map from this file, run\n    ${chalk.cyan(`storymaps project add ${shortPath(file.path)}`)}` });
        }
    }
    if (problems.length) throw new StopError(problems.join('\n\n'));

    if (force && toPush.length) {
        const ok = await guard({ message: `Overwrite ${listNames(toPush.map(p => p.map.name))} on the server, without the conflict check?`, force: false, stopMessage: 'Nothing was pushed.' }).catch(err => {
            // With no terminal, --force is the answer already given
            if (err instanceof StopError) return true;
            throw err;
        });
        if (!ok) {
            console.log('Aborted.');
            return;
        }
    }

    for (const p of toPush) {
        console.log(`  ${p.file.name}  ${p.map.name}`);
        try {
            summaryLines(normalise(p.remote), normalise(p.file.content)).forEach(l => console.log(l));
        } catch { /* the summary is a courtesy */ }
    }
    for (const c of toCreate) console.log(`  ${c.file.name}  ${c.label}  ${chalk.green('new map')}`);
    for (const s of skipped) {
        console.log(`  ${s.file.name}  ${s.label}  ${chalk.yellow(s.why)}`);
        console.log(chalk.dim(`    ${s.hint}`));
    }

    // Passwords, all checked before anything is sent
    const byProjectPassword = toPush.filter(p => p.map.lock === 'project');
    let projectHash = null;
    if (byProjectPassword.length || (toCreate.length && project.locked)) {
        const reason = byProjectPassword.length
            ? `${listNames(byProjectPassword.map(p => p.map.name))} ${byProjectPassword.length === 1 ? 'is' : 'are'} locked with the ${project.name} password`
            : `${project.name} is locked. Enter its password to add ${listNames(toCreate.map(c => c.label))}`;
        projectHash = await projectPassword(baseUrl, project, reason);
    }
    for (const p of toPush) {
        if (p.map.lock === 'project') p.hash = projectHash;
        else if (p.map.lock === 'map') p.hash = await ownMapPassword(baseUrl, p.map, shortPath(p.file.path));
    }

    let pushed = 0;
    const links = [];
    for (const p of toPush) {
        await putMap(baseUrl, p.file.id, p.file.content, { etag: p.etag, lockPasswordHash: p.hash });
        const { etag } = await getMap(baseUrl, p.file.id, 'yaml', { project: projectId });
        await writeEtag(p.file.id, p.file.path, etag);
        links.push(projectLink(baseUrl, projectId, p.file.id));
        pushed++;
    }
    for (const c of toCreate) {
        const created = await createInProject({ baseUrl, project, projectHash, file: c.file, dir, taken: c.taken });
        links.push(projectLink(baseUrl, projectId, created));
        pushed++;
    }
    for (const d of drafts) console.log(chalk.dim(`${d.file.name} was added as ${shortPath(d.became).split('/').pop()}. You can delete it.`));

    if (pushed) {
        console.log(chalk.green(`Pushed ${plural(pushed, 'map')}.`) + (unchanged ? ` ${unchanged} unchanged.` : ''));
        if (toPush.length) links.slice(0, toPush.length).forEach(l => console.log(`  ${l}`));
    } else {
        console.log(chalk.dim(`Nothing to push. ${unchanged} unchanged.`));
    }
}

// Creates a map started with project add and adds it to the project. If another map already has
// its ID, which can only happen for a map started offline, it gets a fresh ID from the server and
// its file is renamed to match: the one rename the CLI ever does.
async function createInProject({ baseUrl, project, projectHash, file, dir, taken }) {
    let id = file.id;
    let content = file.content;
    let path = file.path;
    const name = file.obj.name || 'My Story Map';
    try {
        if (taken) throw new ApiError('A map already has this ID', 412);
        await putMap(baseUrl, id, content, { createOnly: true });
    } catch (err) {
        if (!(err instanceof ApiError && err.status === 412)) throw err;
        const fresh = (await getNewId(baseUrl)).id;
        console.log(chalk.yellow(`Another map already has the ID ${id}, so ${name} gets a new one: ${fresh}`));
        content = setIdKey(content, fresh);
        await putMap(baseUrl, fresh, content, { createOnly: true });
        const newPath = mapFilePath(dir, fresh);
        await writeMapFile(newPath, content);
        await rm(path, { force: true });
        await forgetNewMap(path);
        console.log(`Renamed ${shortPath(path)} to ${shortPath(newPath)}`);
        id = fresh;
        path = newPath;
    }
    console.log(chalk.green(`Created ${name}: ${projectLink(baseUrl, project.id, id)}`));
    const after = await addProjectMap(baseUrl, project.id, id, projectHash || undefined);
    console.log(chalk.green(`Added ${name} to ${project.name}.`));
    reportLock(name, after.maps.find(m => m.id === id));
    await forgetNewMap(path);
    const { etag } = await getMap(baseUrl, id, 'yaml', { project: project.id });
    await writeEtag(id, path, etag);
    return id;
}

// Says the lock a map actually has, as the server labels it. Never suggests what it should have.
export function reportLock(name, map) {
    if (!map?.lock) console.log(chalk.dim(`${name} isn't locked, so anyone with its link can edit it.`));
    else if (map.lock === 'project') console.log(chalk.dim(`${name} is locked with the project password.`));
    else console.log(chalk.dim(`${name} keeps its own lock.`));
}

// ---------------------------------------------------------------------------------------------
// status

// One line per map in tab order, with its file, and a total. From the folder, or from the server
// when given a project link.
export async function statusProject({ baseUrl, projectId, files }) {
    const project = await getProject(baseUrl, projectId);
    const byId = new Map((files || []).filter(f => f.id && !f.broken).map(f => [f.id, f]));
    const rows = [];
    for (const map of project.maps) {
        const file = byId.get(map.id);
        const obj = file ? file.obj : jsyaml.load((await getMap(baseUrl, map.id, 'yaml')).data);
        rows.push({ name: map.name, file: file ? file.name : '', counts: storyCounts(obj), lock: map.lock });
    }
    console.log();
    console.log(chalk.bold(project.name));
    console.log(chalk.dim(projectLink(baseUrl, projectId)));
    if (project.locked) console.log(chalk.yellow('project locked'));
    console.log();
    const nameWidth = Math.max(5, ...rows.map(r => r.name.length));
    const fileWidth = Math.max(0, ...rows.map(r => r.file.length));
    const countWidth = Math.max(...rows.map(r => `${r.counts.done}/${r.counts.total}`.length));
    let done = 0, total = 0;
    for (const r of rows) {
        done += r.counts.done;
        total += r.counts.total;
        const file = fileWidth ? `${chalk.dim(pad(r.file, fileWidth))}  ` : '';
        // Each map's own lock, as the server labels it: the project password, or its own
        const percent = `(${pct(r.counts.done, r.counts.total)})`;
        const lock = r.lock === 'project' ? 'locked' : r.lock === 'map' ? 'own lock' : '';
        // Padding sits outside the colour codes, so an unlocked row ends without stray spaces
        const after = lock ? `${' '.repeat(Math.max(0, 6 - percent.length))}  ${chalk.yellow(lock)}` : '';
        console.log(`  ${pad(r.name, nameWidth)}  ${file}${bar(r.counts.done, r.counts.total)} ${pad(`${r.counts.done}/${r.counts.total}`, countWidth)} ${chalk.dim(percent)}${after}`);
    }
    console.log();
    console.log(`  ${pad('Total', nameWidth)}  ${fileWidth ? ' '.repeat(fileWidth + 2) : ''}${bar(done, total)} ${done}/${total} stories ${chalk.dim(`(${pct(done, total)})`)}`);
    console.log();
}

// ---------------------------------------------------------------------------------------------
// diff

export async function diffProject(ctx, { full } = {}) {
    const project = await getProject(ctx.baseUrl, ctx.projectId);
    const inProject = new Map(project.maps.map(m => [m.id, m]));
    let same = 0;
    for (const file of ctx.files) {
        if (file.broken) {
            console.log(chalk.yellow(`  ${file.name}  can't be read as YAML: ${file.broken}`));
            continue;
        }
        if (!file.id || !inProject.has(file.id)) continue;
        const { data } = await getMap(ctx.baseUrl, file.id, 'yaml', { project: ctx.projectId });
        const [remote, local] = [normalise(data), normalise(file.content)];
        if (remote === local) {
            same++;
            continue;
        }
        if (full) {
            console.log(chalk.bold(`--- remote: ${projectLink(ctx.baseUrl, ctx.projectId, file.id)}`));
            console.log(chalk.bold(`+++ local: ${shortPath(file.path)}`));
            printFullDiff(diffLines(remote, local));
            console.log();
            continue;
        }
        console.log(`  ${file.name}  ${inProject.get(file.id).name}`);
        summaryLines(remote, local).forEach(l => console.log(l));
    }
    console.log(chalk.dim(same === ctx.files.length ? 'No differences.' : `${plural(same, 'map')} the same as the server.`));
    if (!full && same < ctx.files.length) console.log(chalk.dim(`Run ${chalk.cyan('storymaps diff --full')} for the full file diff.`));
}

// ---------------------------------------------------------------------------------------------
// backup, backups, restore

const cards = (n) => plural(n, 'card');
const BACKUP_LIMIT_WAIT = 61_000;

// Backs up every map with one note. Unchanged maps reuse their last backup. A failure doesn't
// stop the rest, as backups change nothing; failures are reported at the end.
export async function backupProject(ctx, { message }) {
    const project = await getProject(ctx.baseUrl, ctx.projectId);
    const byId = new Map(ctx.files.filter(f => f.id).map(f => [f.id, f]));
    const maps = project.maps.filter(m => byId.has(m.id));
    const projectHash = maps.some(m => m.lock === 'project')
        ? await projectPassword(ctx.baseUrl, project, `${project.name} is locked. Enter its password to back up its maps`)
        : null;
    const nameWidth = Math.max(...maps.map(m => m.name.length));
    let made = 0, reused = 0;
    const failed = [];
    for (const map of maps) {
        const file = byId.get(map.id);
        let hash;
        try {
            hash = map.lock === 'project' ? projectHash : map.lock === 'map' ? await ownMapPassword(ctx.baseUrl, map, shortPath(file.path)) : undefined;
        } catch (err) {
            failed.push(`${map.name}: ${err.message}`);
            continue;
        }
        let backup;
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                backup = await createBackup(ctx.baseUrl, map.id, message || '', { lockPasswordHash: hash });
                break;
            } catch (err) {
                if (err instanceof ApiError && err.status === 429 && attempt === 0) {
                    console.log(chalk.dim('The server takes 10 backups a minute, so this waits a minute...'));
                    await new Promise(r => setTimeout(r, BACKUP_LIMIT_WAIT));
                    continue;
                }
                failed.push(`${map.name}: ${err.message}`);
                break;
            }
        }
        if (!backup) continue;
        const label = `  ${file.name}  ${pad(map.name, nameWidth)}  `;
        if (backup.unchanged) {
            reused++;
            console.log(label + chalk.dim(`no changes since backup ${backup.id} from ${formatTime(backup.timestamp)}`));
        } else {
            made++;
            console.log(label + chalk.green(`backed up as ${backup.id} (${cards(backup.cardCount)})`));
        }
    }
    const parts = [];
    if (made) parts.push(chalk.green(`Backed up ${plural(made, 'map')}.`));
    if (reused) parts.push(`${reused} had no changes since their last backup.`);
    if (parts.length) console.log(parts.join(' '));
    if (failed.length) {
        console.error(chalk.red(`Not backed up:\n${failed.map(f => `  ${f}`).join('\n')}`));
        process.exitCode = 1;
    }
}

// The newest backup of each map, in tab order
export async function backupsProject(ctx) {
    const project = await getProject(ctx.baseUrl, ctx.projectId);
    const byId = new Map(ctx.files.filter(f => f.id).map(f => [f.id, f]));
    const maps = project.maps.filter(m => byId.has(m.id));
    const nameWidth = Math.max(...maps.map(m => m.name.length));
    console.log(`${project.name}, newest backup of each map`);
    for (const map of maps) {
        const backups = await listBackups(ctx.baseUrl, map.id);
        const newest = backups[backups.length - 1];
        if (!newest) {
            console.log(`  ${pad(map.name, nameWidth)}  ${chalk.dim('no backups yet')}`);
            continue;
        }
        console.log(`  ${pad(map.name, nameWidth)}  ${chalk.cyan(newest.id)}  ${chalk.dim(formatTime(newest.timestamp))}  ${newest.note || chalk.dim('(no note)')}`);
    }
    console.log(chalk.dim(`Every backup of one map: ${chalk.cyan('storymaps backups -f storymaps/<id>.yml')}`));
}

// Which map in the folder a backup ID belongs to
export async function findBackupMap(ctx, backupId) {
    for (const file of ctx.files.filter(f => f.id)) {
        const backups = await listBackups(ctx.baseUrl, file.id).catch(() => []);
        if (backups.some(b => b.id === backupId)) return file;
    }
    throw new StopError(`No map in ${shortPath(ctx.dir)} has a backup ${backupId}. Run storymaps backups to see them.`);
}

// ---------------------------------------------------------------------------------------------
// open

export async function openProject(ctx) {
    const project = await getProject(ctx.baseUrl, ctx.projectId);
    const first = project.maps[0]?.id;
    const url = projectLink(ctx.baseUrl, ctx.projectId, first);
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    exec(`${cmd} ${url}`);
    console.log(chalk.green(url));
}
