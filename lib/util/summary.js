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

    // Detect card-level changes per slice (name-aware, handles renames)
    const collectCardNames = (map) => {
        const result = {};
        for (const slice of (map.slices || [])) {
            const names = [];
            for (const cards of Object.values(slice.stories || {})) {
                if (Array.isArray(cards)) names.push(...cards.map(c => c.name).filter(Boolean));
            }
            result[slice.name] = names;
        }
        return result;
    };
    const oldCards = collectCardNames(old);
    const newCards = collectCardNames(cur);
    for (const sliceName of new Set([...Object.keys(oldCards), ...Object.keys(newCards)])) {
        const oldNames = oldCards[sliceName] || [];
        const newNames = newCards[sliceName] || [];
        const oldCounts = new Map();
        const newCounts = new Map();
        for (const n of oldNames) oldCounts.set(n, (oldCounts.get(n) || 0) + 1);
        for (const n of newNames) newCounts.set(n, (newCounts.get(n) || 0) + 1);
        const allNames = new Set([...oldCounts.keys(), ...newCounts.keys()]);
        let added = 0, removed = 0;
        for (const n of allNames) {
            const o = oldCounts.get(n) || 0;
            const c = newCounts.get(n) || 0;
            if (c > o) added += c - o;
            if (o > c) removed += o - c;
        }
        if (added === 0 && removed === 0) continue;
        const net = newNames.length - oldNames.length;
        if (net === 0) {
            const word = added === 1 ? 'card' : 'cards';
            lines.push(chalk.yellow(`  ~ ${sliceName}: ${added} ${word} renamed`));
        } else {
            if (added) lines.push(chalk.green(`  + ${sliceName}: ${added} ${added === 1 ? 'card' : 'cards'}`));
            if (removed) lines.push(chalk.red(`  - ${sliceName}: ${removed} ${removed === 1 ? 'card' : 'cards'}`));
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
