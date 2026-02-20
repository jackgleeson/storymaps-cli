// Storymaps CLI — AGPL-3.0 — see LICENCE for details
// Semantic change summary between two normalised YAML strings

import chalk from 'chalk';
import jsyaml from 'js-yaml';

export function changeSummary(oldYaml, newYaml) {
    const old = jsyaml.load(oldYaml);
    const cur = jsyaml.load(newYaml);

    const lines = [];

    if (old.name !== cur.name) {
        lines.push(`  name: ${chalk.red(old.name)} → ${chalk.green(cur.name)}`);
    }

    // Steps (skip spacers and partial refs)
    const stepName = s => {
        if (typeof s === 'string' && s !== 'spacer') return s;
        if (typeof s === 'object' && s?.name) return s.name;
        return null;
    };
    const oldSteps = (old.steps || []).map(stepName).filter(Boolean);
    const newSteps = (cur.steps || []).map(stepName).filter(Boolean);
    const addedSteps = newSteps.filter(s => !oldSteps.includes(s));
    const removedSteps = oldSteps.filter(s => !newSteps.includes(s));
    if (addedSteps.length || removedSteps.length) {
        const total = newSteps.length - oldSteps.length;
        const delta = total > 0 ? chalk.green(`+${total}`) : total < 0 ? chalk.red(`${total}`) : chalk.dim('±0');
        lines.push(`  steps: ${delta}`);
        for (const s of addedSteps) lines.push(chalk.green(`    + ${s}`));
        for (const s of removedSteps) lines.push(chalk.red(`    - ${s}`));
    }

    // Slices
    const oldSlices = (old.slices || []).map(s => s.name);
    const newSlices = (cur.slices || []).map(s => s.name);
    for (const s of newSlices.filter(s => !oldSlices.includes(s))) {
        lines.push(chalk.green(`  + slice: ${s}`));
    }
    for (const s of oldSlices.filter(s => !newSlices.includes(s))) {
        lines.push(chalk.red(`  - slice: ${s}`));
    }

    // Count story-level changes per slice
    const countStories = (map) => {
        const counts = {};
        for (const slice of (map.slices || [])) {
            const stories = slice.stories || {};
            counts[slice.name] = Object.values(stories)
                .reduce((n, cards) => n + (Array.isArray(cards) ? cards.length : 0), 0);
        }
        return counts;
    };
    const oldCounts = countStories(old);
    const newCounts = countStories(cur);
    for (const name of new Set([...Object.keys(oldCounts), ...Object.keys(newCounts)])) {
        const oc = oldCounts[name] || 0;
        const nc = newCounts[name] || 0;
        if (oc !== nc) {
            const delta = nc - oc;
            const word = Math.abs(delta) === 1 ? 'story' : 'stories';
            if (delta > 0) lines.push(chalk.green(`  + ${name}: ${delta} ${word}`));
            else lines.push(chalk.red(`  - ${name}: ${Math.abs(delta)} ${word}`));
        }
    }

    // Notes
    const oldNotes = (old.notes || '').trim();
    const curNotes = (cur.notes || '').trim();
    if (oldNotes !== curNotes) {
        if (!oldNotes) lines.push(chalk.green('  + notes'));
        else if (!curNotes) lines.push(chalk.red('  - notes'));
        else lines.push('  ~ notes updated');
    }

    return lines;
}

export function printChangeSummary(oldYaml, newYaml) {
    const lines = changeSummary(oldYaml, newYaml);
    if (lines.length === 0) {
        console.log(chalk.dim('No changes.'));
    } else {
        lines.forEach(l => console.log(l));
    }
}
