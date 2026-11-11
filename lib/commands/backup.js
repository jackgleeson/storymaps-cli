// Storymaps CLI — AGPL-3.0 — see LICENCE for details
// storymaps backup, backups and restore - make, list and restore backups of a map on the server

import { resolve } from 'node:path';
import chalk from 'chalk';
import { resolveTarget } from '../util/identity.js';
import { createBackup, listBackups, getBackup, getLockStatus, putMap } from '../util/api.js';
import { formatTime } from '../util/time.js';
import { findProjectFolder, shortPath } from '../util/project.js';
import { singleMapPassword } from '../util/passwords.js';
import { guard } from '../util/prompt.js';
import { backupProject, backupsProject, findBackupMap } from './project-sync.js';

const cards = (n) => `${n} card${n === 1 ? '' : 's'}`;

export async function backupCommand(target, opts) {
    // No -f in a project folder: every map, with the same note
    if (!target) {
        const ctx = await findProjectFolder(opts);
        if (ctx?.projectId) {
            await backupProject(ctx, opts);
            return;
        }
    }
    const { id, baseUrl } = await resolveTarget(target, resolve(opts.file || 'storymap.yml'));
    const lockPasswordHash = await lockPassword(baseUrl, id);
    const backup = await createBackup(baseUrl, id, opts.message || '', { lockPasswordHash });
    if (backup.unchanged) {
        console.log(`No changes since backup ${chalk.cyan(backup.id)} from ${formatTime(backup.timestamp)}, so no new backup was made.`);
        return;
    }
    console.log(chalk.green(`Backed up map ${id} as ${backup.id} (${cards(backup.cardCount)})`));
}

export async function backupsCommand(target, opts) {
    // No -f in a project folder: the newest backup of each map
    if (!target) {
        const ctx = await findProjectFolder(opts);
        if (ctx?.projectId) {
            await backupsProject(ctx);
            return;
        }
    }
    const { id, baseUrl } = await resolveTarget(target, resolve(opts.file || 'storymap.yml'));
    const backups = await listBackups(baseUrl, id);

    if (backups.length === 0) {
        console.log(chalk.dim(`No backups yet. Run ${chalk.cyan('storymaps backup')} to make one.`));
        return;
    }

    // Newest first, like the log
    for (const b of [...backups].reverse()) {
        const note = b.note || chalk.dim('(no note)');
        const imported = b.imported ? chalk.dim('  imported') : '';
        console.log(`${chalk.cyan(b.id)}  ${chalk.dim(formatTime(b.timestamp))}  ${cards(b.cardCount).padEnd(9)}  ${note}${imported}`);
    }
    console.log(chalk.dim(`\nRestore one with ${chalk.cyan('storymaps restore <backup ID>')}`));
}

// The lock password for a locked map, checked with the server before anything changes:
// remembered after storymaps unlock, STORYMAPS_PASSWORD, or typed
async function lockPassword(baseUrl, id) {
    const { isLocked } = await getLockStatus(baseUrl, id);
    if (!isLocked) return undefined;
    return singleMapPassword(baseUrl, id);
}

export async function restoreCommand(backupId, target, opts) {
    // In a project folder, a backup ID belongs to one map, so the CLI finds which
    let filePath = resolve(opts.file || 'storymap.yml');
    if (!target && !opts.file) {
        const ctx = await findProjectFolder(opts);
        if (ctx?.projectId) filePath = (await findBackupMap(ctx, backupId)).path;
    }
    const { id, baseUrl } = await resolveTarget(target, filePath);
    const backup = await getBackup(baseUrl, id, backupId);
    const note = backup.note ? `, "${backup.note}"` : '';
    console.log(`Backup ${backup.id} from ${formatTime(backup.timestamp)}: ${backup.mapName || 'Untitled'}, ${cards(backup.cardCount)}${note}`);

    const ok = await guard({ message: 'Restore this backup? The map is backed up first.', force: opts.force, stopMessage: 'Nothing was restored.' });
    if (!ok) {
        console.log('Aborted.');
        return;
    }

    const lockPasswordHash = await lockPassword(baseUrl, id);

    // Like the app: a backup of the map as it is now, so the restore can be undone
    const safety = await createBackup(baseUrl, id, 'Auto: before restore', { lockPasswordHash });
    await putMap(baseUrl, id, backup.data, { contentType: 'application/json', lockPasswordHash, restoredBackup: backup.id });

    console.log(chalk.green(`Restored map ${id} from backup ${backup.id}`));
    console.log(chalk.dim(`The map before the restore is backup ${safety.id}.`));
    // The saved ETag is left alone, so a push from an old local file stops with a conflict
    // The local file isn't overwritten, as it may have changes not pushed yet
    const into = target ? 'your local file' : shortPath(filePath);
    console.log(`Run ${chalk.cyan('storymaps pull')} to bring the restored map into ${into}.`);
}
