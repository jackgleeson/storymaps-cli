// Storymaps CLI — AGPL-3.0 — see LICENCE for details
// Semantic change summary between two normalised YAML strings

import chalk from 'chalk';
import jsyaml from 'js-yaml';

// Fields compared on cards and steps that exist on both sides
const FIELDS = ['body', 'color', 'url', 'status', 'points', 'tags'];

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Slice names can span lines (e.g. "V1:\nBasic House"); keep each summary entry on one line
const oneLine = (s) => String(s ?? '').replace(/\s*\n\s*/g, ' ');

const changedFields = (a, b) =>
    FIELDS.filter(f => JSON.stringify(a?.[f] ?? null) !== JSON.stringify(b?.[f] ?? null));

// True when the names both lists share appear in a different order
const reordered = (oldNames, newNames) => {
    const common = oldNames.filter(n => newNames.includes(n));
    const commonNew = newNames.filter(n => oldNames.includes(n));
    return common.join('\n') !== commonNew.join('\n');
};

// Compare located cards ({ card, group, at }) across the whole map. Cards are
// paired by name in order, so a card that changes slice or step counts as moved
// rather than removed and added. Returns per-group summary lines.
function compareCards(oldItems, newItems) {
    const stats = new Map();
    const statsFor = (group) => {
        if (!stats.has(group)) stats.set(group, { added: 0, removed: 0, moved: 0, updated: 0, fields: new Set() });
        return stats.get(group);
    };
    // Report groups in their new order, then any that only exist on the old side
    newItems.forEach(i => statsFor(i.group));
    oldItems.forEach(i => statsFor(i.group));

    const byName = (items) => {
        const map = new Map();
        for (const item of items) {
            const name = item.card?.name ?? '';
            if (!map.has(name)) map.set(name, []);
            map.get(name).push(item);
        }
        return map;
    };
    const oldByName = byName(oldItems);
    const newByName = byName(newItems);

    for (const name of new Set([...oldByName.keys(), ...newByName.keys()])) {
        const o = oldByName.get(name) || [];
        const c = newByName.get(name) || [];
        const paired = Math.min(o.length, c.length);
        for (let i = 0; i < paired; i++) {
            const s = statsFor(c[i].group);
            if (o[i].group !== c[i].group || o[i].at !== c[i].at) s.moved++;
            const fields = changedFields(o[i].card, c[i].card);
            if (fields.length) {
                s.updated++;
                fields.forEach(f => s.fields.add(f));
            }
        }
        c.slice(paired).forEach(item => statsFor(item.group).added++);
        o.slice(paired).forEach(item => statsFor(item.group).removed++);
    }

    const lines = [];
    for (const [group, s] of stats) {
        // Equal numbers of unmatched adds and removes means the cards were renamed
        if (s.added && s.added === s.removed) {
            lines.push(chalk.yellow(`  ~ ${oneLine(group)}: ${plural(s.added, 'card')} renamed`));
        } else {
            if (s.added) lines.push(chalk.green(`  + ${oneLine(group)}: ${plural(s.added, 'card')}`));
            if (s.removed) lines.push(chalk.red(`  - ${oneLine(group)}: ${plural(s.removed, 'card')}`));
        }
        if (s.moved) lines.push(chalk.yellow(`  ~ ${oneLine(group)}: ${plural(s.moved, 'card')} moved`));
        if (s.updated) {
            lines.push(chalk.yellow(`  ~ ${oneLine(group)}: ${plural(s.updated, 'card')} updated (${[...s.fields].join(', ')})`));
        }
    }
    return lines;
}

function compareLegend(oldLegend, newLegend) {
    const lines = [];
    const key = e => `${e?.color ?? ''}\n${e?.label ?? ''}`;
    const removed = [...oldLegend];
    const added = [];
    for (const entry of newLegend) {
        const i = removed.findIndex(e => key(e) === key(entry));
        if (i >= 0) removed.splice(i, 1);
        else added.push(entry);
    }
    // Same color with a new label is a rename; same label with a new color is a recolor
    for (const entry of [...added]) {
        let i = removed.findIndex(e => e.color === entry.color);
        if (i >= 0) {
            lines.push(chalk.yellow(`  ~ legend: ${removed[i].label} → ${entry.label}`));
        } else if ((i = removed.findIndex(e => e.label === entry.label)) >= 0) {
            lines.push(chalk.yellow(`  ~ legend: ${entry.label} color changed`));
        } else {
            continue;
        }
        removed.splice(i, 1);
        added.splice(added.indexOf(entry), 1);
    }
    for (const e of added) lines.push(chalk.green(`  + legend: ${e.label}`));
    for (const e of removed) lines.push(chalk.red(`  - legend: ${e.label}`));
    if (!lines.length && reordered(oldLegend.map(key), newLegend.map(key))) {
        lines.push(chalk.yellow('  ~ legend reordered'));
    }
    return lines;
}

export function changeSummary(oldYaml, newYaml) {
    const old = jsyaml.load(oldYaml);
    const cur = jsyaml.load(newYaml);

    const lines = [];

    if (old.name !== cur.name) {
        lines.push(`  name: ${chalk.red(old.name)} → ${chalk.green(cur.name)}`);
    }

    // Steps (skip spacers and partial refs)
    const toStep = s => {
        if (typeof s === 'string' && s !== 'spacer') return { name: s };
        if (typeof s === 'object' && s?.name) return s;
        return null;
    };
    const oldStepObjs = (old.steps || []).map(toStep).filter(Boolean);
    const newStepObjs = (cur.steps || []).map(toStep).filter(Boolean);
    const oldSteps = oldStepObjs.map(s => s.name);
    const newSteps = newStepObjs.map(s => s.name);
    const addedSteps = newSteps.filter(s => !oldSteps.includes(s));
    const removedSteps = oldSteps.filter(s => !newSteps.includes(s));
    if (addedSteps.length || removedSteps.length) {
        const total = newSteps.length - oldSteps.length;
        const delta = total > 0 ? chalk.green(`+${total}`) : total < 0 ? chalk.red(`${total}`) : chalk.dim('±0');
        lines.push(`  steps: ${delta}`);
        for (const s of addedSteps) lines.push(chalk.green(`    + ${s}`));
        for (const s of removedSteps) lines.push(chalk.red(`    - ${s}`));
    }
    if (reordered(oldSteps, newSteps)) lines.push(chalk.yellow('  ~ steps reordered'));
    const stepFields = new Set();
    let updatedSteps = 0;
    for (const step of newStepObjs) {
        const before = oldStepObjs.find(s => s.name === step.name);
        if (!before) continue;
        const fields = changedFields(before, step);
        if (fields.length) {
            updatedSteps++;
            fields.forEach(f => stepFields.add(f));
        }
    }
    if (updatedSteps) {
        lines.push(chalk.yellow(`  ~ steps: ${plural(updatedSteps, 'step')} updated (${[...stepFields].join(', ')})`));
    }

    // Slices
    const oldSlices = (old.slices || []).map(s => s.name);
    const newSlices = (cur.slices || []).map(s => s.name);
    // A slice whose name changed in the same position is a rename, so its cards aren't reported as moved
    const sliceRenames = new Map();
    oldSlices.forEach((name, i) => {
        const newName = newSlices[i];
        if (newName !== undefined && !newSlices.includes(name) && !oldSlices.includes(newName)) {
            sliceRenames.set(name, newName);
        }
    });
    const currentName = name => sliceRenames.get(name) ?? name;
    for (const [from, to] of sliceRenames) {
        lines.push(chalk.yellow(`  ~ slice: ${oneLine(from)} → ${oneLine(to)}`));
    }
    const renamedTo = new Set(sliceRenames.values());
    for (const s of newSlices.filter(s => !oldSlices.includes(s) && !renamedTo.has(s))) {
        lines.push(chalk.green(`  + slice: ${oneLine(s)}`));
    }
    for (const s of oldSlices.filter(s => !newSlices.includes(s) && !sliceRenames.has(s))) {
        lines.push(chalk.red(`  - slice: ${oneLine(s)}`));
    }
    if (reordered(oldSlices.map(currentName), newSlices)) lines.push(chalk.yellow('  ~ slices reordered'));
    for (const slice of cur.slices || []) {
        const before = (old.slices || []).find(s => currentName(s.name) === slice.name);
        if (!before) continue;
        if (!!before.collapsed !== !!slice.collapsed || before.closedReason !== slice.closedReason) {
            const state = !slice.collapsed ? 'reopened' : slice.closedReason === 'closed' ? 'closed' : 'completed';
            lines.push(chalk.yellow(`  ~ slice: ${oneLine(slice.name)} ${state}`));
        }
    }

    // Cards: users, activities and stories in every slice
    const collectCards = (map, sliceName) => {
        const items = [];
        for (const group of ['users', 'activities']) {
            for (const card of map[group] || []) items.push({ card, group, at: card.step });
        }
        for (const slice of map.slices || []) {
            const group = sliceName(slice.name);
            for (const [step, cards] of Object.entries(slice.stories || {})) {
                if (Array.isArray(cards)) cards.forEach(card => items.push({ card, group, at: step }));
            }
        }
        return items;
    };
    lines.push(...compareCards(collectCards(old, currentName), collectCards(cur, name => name)));

    lines.push(...compareLegend(old.legend || [], cur.legend || []));

    if (JSON.stringify(old.partials ?? null) !== JSON.stringify(cur.partials ?? null)) {
        lines.push(chalk.yellow('  ~ partials updated'));
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
    if (lines.length) {
        lines.forEach(l => console.log(l));
    } else if (oldYaml === newYaml) {
        console.log(chalk.dim('No changes.'));
    } else {
        // Something differs that the summary doesn't describe (e.g. card order within a step)
        console.log(chalk.yellow(`  ~ changes not shown in summary, run ${chalk.cyan('storymaps diff --full')} to see them`));
    }
}
