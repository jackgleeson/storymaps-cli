// Storymaps CLI — AGPL-3.0 — see LICENCE for details
// storymaps backup, backups and restore - make, list and restore backups of a map on the server

import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import chalk from 'chalk';
import { confirm, password } from '@inquirer/prompts';
import { resolveTarget } from '../util/identity.js';
import { createBackup, listBackups, getBackup, getLockStatus, unlockMap, putMap, ApiError } from '../util/api.js';
import { readCache, writeCache } from '../util/file.js';
import { formatTime } from '../util/time.js';

const cards = (n) => `${n} card${n === 1 ? '' : 's'}`;

export async function backupCommand(target, opts) {
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

// The lock password for a locked map, checked with the server before anything changes.
// The saved one from storymaps unlock is tried first.
async function lockPassword(baseUrl, id) {
    const { isLocked } = await getLockStatus(baseUrl, id);
    if (!isLocked) return undefined;

    const saved = (await readCache(id)).hash;
    if (saved) {
        try {
            await unlockMap(baseUrl, id, saved);
            return saved;
        } catch (err) {
            if (!(err instanceof ApiError && err.status === 403)) throw err;
        }
    }

    console.log(chalk.yellow('Map is locked.'));
    const pw = await password({ theme: { prefix: '>' }, message: 'Password:' });
    const hash = createHash('sha256').update(pw).digest('hex');
    await unlockMap(baseUrl, id, hash);
    await writeCache(id, { hash });
    return hash;
}

export async function restoreCommand(backupId, target, opts) {
    const filePath = resolve(opts.file || 'storymap.yml');
    const { id, baseUrl } = await resolveTarget(target, filePath);
    const backup = await getBackup(baseUrl, id, backupId);
    const note = backup.note ? `, "${backup.note}"` : '';
    console.log(`Backup ${backup.id} from ${formatTime(backup.timestamp)}: ${backup.mapName || 'Untitled'}, ${cards(backup.cardCount)}${note}`);

    if (!opts.force) {
        const ok = await confirm({
            message: 'Restore this backup? The map is backed up first.',
            default: true,
            theme: { prefix: '>' },
        });
        if (!ok) {
            console.log('Aborted.');
            return;
        }
    }

    const lockPasswordHash = await lockPassword(baseUrl, id);

    // Like the app: a backup of the map as it is now, so the restore can be undone
    const safety = await createBackup(baseUrl, id, 'Auto: before restore', { lockPasswordHash });
    await putMap(baseUrl, id, backup.data, { contentType: 'application/json', lockPasswordHash, restoredBackup: backup.id });

    console.log(chalk.green(`Restored map ${id} from backup ${backup.id}`));
    console.log(chalk.dim(`The map before the restore is backup ${safety.id}.`));
    // The saved ETag is left alone, so a push from an old local file stops with a conflict
    console.log(`Run ${chalk.cyan('storymaps pull')} to bring the restored map into your local file.`);
}
