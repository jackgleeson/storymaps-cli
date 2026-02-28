// Storymaps CLI — AGPL-3.0 — see LICENCE for details
// storymaps log — show activity log for a map

import { resolve } from 'node:path';
import chalk from 'chalk';
import { resolveTarget } from '../util/identity.js';
import { getLog } from '../util/api.js';

function formatTime(ts) {
    const d = new Date(ts);
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;

    if (d.toDateString() === now.toDateString()) return time;
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${time}`;
}

function sourceLabel(entry) {
    if (entry.src === 'cli') return '>_';
    if (entry.src === 'mobile') return '📱';
    return '🌐';
}

export async function logCommand(target, opts) {
    const filePath = resolve(opts.file || 'storymap.yml');
    const { id, baseUrl } = await resolveTarget(target, filePath);

    const entries = await getLog(baseUrl, id);

    if (entries.length === 0) {
        console.log(chalk.dim('No activity yet.'));
        return;
    }

    for (const entry of entries) {
        const time = chalk.dim(formatTime(entry.ts));
        const icon = sourceLabel(entry);
        const who = entry.src !== 'cli' && entry.name ? `${entry.name}: ` : '';
        console.log(`${time}  ${icon}  ${who}${entry.text}`);
    }
}
