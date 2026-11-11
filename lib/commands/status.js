// Storymaps CLI — AGPL-3.0 — see LICENCE for details
// storymaps status — product manager overview of the board

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import chalk from 'chalk';
import jsyaml from 'js-yaml';
import { resolveTarget, parseProjectLink } from '../util/identity.js';
import { findProjectFolder } from '../util/project.js';
import { getMap, ApiError } from '../util/api.js';

const STATUS_ICONS = {
    'done':        chalk.green('●'),
    'in-progress': chalk.yellow('●'),
    'planned':     chalk.blue('●'),
    'blocked':     chalk.red('●'),
};

function bar(done, total, width = 20) {
    if (total === 0) return chalk.dim('░'.repeat(width));
    const filled = Math.round((done / total) * width);
    return chalk.green('█'.repeat(filled)) + chalk.dim('░'.repeat(width - filled));
}

function pct(n, total) {
    if (total === 0) return '0%';
    return `${Math.round((n / total) * 100)}%`;
}

// A local file, or else the map on the server when the target is a link or map ID
async function loadContent(target, opts) {
    const isUrl = target && /^https?:\/\//i.test(target);
    const filePath = resolve((!isUrl && target) || opts.file || 'storymap.yml');
    if (!isUrl) {
        try {
            return await readFile(filePath, 'utf-8');
        } catch {
            if (!target) {
                console.error(chalk.red(`File not found: ${filePath}`));
                process.exit(1);
            }
        }
    }
    const { id, baseUrl } = await resolveTarget(target, resolve(opts.file || 'storymap.yml'));
    try {
        return (await getMap(baseUrl, id, 'yaml')).data;
    } catch (err) {
        if (err instanceof ApiError && err.status === 404 && !isUrl && !target.includes('/')) {
            console.error(chalk.red(`No file or map found: ${target}`));
            process.exit(1);
        }
        throw err;
    }
}

// Task cards across every slice, and how many are done. Cards in a legend colour not labelled as
// a task, such as notes and questions, aren't counted.
export function storyCounts(map) {
    const nonTaskColors = new Set((map.legend || []).filter(e => !/task/i.test(e.label || '')).map(e => e.color));
    let done = 0, total = 0;
    for (const slice of map.slices || []) {
        for (const cards of Object.values(slice.stories || {})) {
            if (!Array.isArray(cards)) continue;
            for (const card of cards) {
                if (card.color && nonTaskColors.has(card.color)) continue;
                total++;
                if (card.status === 'done') done++;
            }
        }
    }
    return { done, total };
}

export { bar, pct };

export async function statusCommand(target, opts) {
    // A project: one line per map and a total, from the folder or, for a project link, the server
    const link = parseProjectLink(target);
    if (link && !link.mapId) {
        const { statusProject } = await import('./project-sync.js');
        await statusProject({ baseUrl: link.baseUrl, projectId: link.projectId, files: null });
        return;
    }
    if (!target) {
        const ctx = await findProjectFolder(opts);
        if (ctx?.projectId) {
            const { statusProject } = await import('./project-sync.js');
            await statusProject(ctx);
            return;
        }
    }

    const content = await loadContent(target, opts);

    const map = jsyaml.load(content);
    if (!map || typeof map !== 'object') {
        console.error(chalk.red('Invalid storymap file.'));
        process.exit(1);
    }

    // Header
    console.log();
    console.log(chalk.bold(map.name || '(untitled)'));
    if (map.id) console.log(chalk.dim(`id: ${map.id}`));
    if (map.locked) console.log(chalk.yellow('locked'));
    console.log();

    // Build set of non-task colors from legend (exclude entries labelled "task*")
    const nonTaskColors = new Set();
    for (const entry of (map.legend || [])) {
        if (!/task/i.test(entry.label || '')) {
            nonTaskColors.add(entry.color);
        }
    }
    const isTask = (card) => !card.color || !nonTaskColors.has(card.color);

    // Collect all task stories across slices
    const slices = map.slices || [];
    const allStories = [];

    for (const slice of slices) {
        const stories = slice.stories || {};
        for (const cards of Object.values(stories)) {
            if (Array.isArray(cards)) {
                for (const card of cards) {
                    if (isTask(card)) allStories.push(card);
                }
            }
        }
    }

    const totalStories = allStories.length;
    const totalPoints = allStories.reduce((sum, s) => sum + (s.points || 0), 0);

    // Status breakdown
    const byStatus = { done: [], 'in-progress': [], planned: [], blocked: [] };
    let noStatus = 0;
    for (const story of allStories) {
        if (story.status && byStatus[story.status]) {
            byStatus[story.status].push(story);
        } else {
            noStatus++;
        }
    }

    const doneCount = byStatus.done.length;
    const donePoints = byStatus.done.reduce((sum, s) => sum + (s.points || 0), 0);

    // Overall progress
    console.log(chalk.bold('Overall Progress'));
    console.log(`  ${bar(doneCount, totalStories)} ${doneCount}/${totalStories} stories ${chalk.dim(`(${pct(doneCount, totalStories)})`)}`);
    if (totalPoints > 0) {
        console.log(chalk.dim(`  ${totalPoints} points total`));
    }
    console.log();

    // Per-slice breakdown
    if (slices.length > 0) {
        const maxName = Math.max(...slices.map(s => (s.name || '(unnamed)').length));
        console.log(chalk.bold('Slices'));
        for (const slice of slices) {
            const stories = slice.stories || {};
            const cards = Object.values(stories).flat().filter(c => c && isTask(c));
            const total = cards.length;
            const label = (slice.name || '(unnamed)').padEnd(maxName);
            if (total === 0) {
                console.log(`  ${chalk.dim(label)}  (empty)`);
                continue;
            }
            const done = cards.filter(c => c.status === 'done').length;
            const pts = cards.reduce((sum, s) => sum + (s.points || 0), 0);
            const donePts = cards.filter(c => c.status === 'done').reduce((sum, s) => sum + (s.points || 0), 0);
            const blocked = cards.filter(c => c.status === 'blocked').length;

            const ptsLabel = pts > 0 ? ` | ${donePts}/${pts}pts` : '';
            const blockedLabel = blocked > 0 ? chalk.red(` ${blocked} blocked`) : '';

            console.log(`  ${label}  ${bar(done, total, 15)} ${done}/${total} (${pct(done, total)})${ptsLabel}${blockedLabel}`);
        }
        console.log();
    }

    // Status summary
    if (totalStories > 0) {
        console.log(chalk.bold('Status'));
        for (const [status, stories] of Object.entries(byStatus)) {
            if (stories.length === 0) continue;
            const pts = stories.reduce((sum, s) => sum + (s.points || 0), 0);
            const ptsLabel = pts > 0 ? chalk.dim(` (${pts}pts)`) : '';
            console.log(`  ${STATUS_ICONS[status]} ${status}: ${stories.length}${ptsLabel}`);
        }
        if (noStatus > 0) {
            console.log(`  ${chalk.dim('○')} no status: ${noStatus}`);
        }
        console.log();
    }

    // Blocked stories (call these out)
    if (byStatus.blocked.length > 0) {
        console.log(chalk.red.bold('Blocked'));
        for (const story of byStatus.blocked) {
            console.log(`  ${chalk.red('●')} ${story.name}${story.body ? chalk.dim(`: ${story.body.split('\n')[0]}`) : ''}`);
        }
        console.log();
    }

}
