// Storymaps CLI — AGPL-3.0 — see LICENCE for details
// The line-by-line diff that storymaps diff --full prints

import chalk from 'chalk';

// Prints the changed lines of a diffLines result, with three lines around each change
export function printFullDiff(changes) {
    const CONTEXT = 3;
    const lines = [];
    let oldLine = 1;
    let newLine = 1;
    for (const part of changes) {
        for (const text of part.value.replace(/\n$/, '').split('\n')) {
            if (part.added) {
                lines.push({ tag: '+', text, oldNum: null, newNum: newLine++ });
            } else if (part.removed) {
                lines.push({ tag: '-', text, oldNum: oldLine++, newNum: null });
            } else {
                lines.push({ tag: ' ', text, oldNum: oldLine++, newNum: newLine++ });
            }
        }
    }

    const width = String(Math.max(oldLine, newLine)).length;
    const pad = n => n === null ? ' '.repeat(width) : String(n).padStart(width);


    let lastPrinted = -1;
    for (let i = 0; i < lines.length; i++) {
        const nearby = lines.slice(Math.max(0, i - CONTEXT), i + CONTEXT + 1);
        if (!nearby.some(l => l.tag !== ' ')) continue;
        if (lastPrinted !== -1 && i - lastPrinted > 1) {
            console.log(chalk.dim(`${'·'.repeat(width * 2 + 5)}`));
        }
        const { tag, text, oldNum, newNum } = lines[i];
        const num = chalk.dim(`${pad(oldNum)} ${pad(newNum)}`);
        if (tag === '+') console.log(`${num} ${chalk.green(`+ ${text}`)}`);
        else if (tag === '-') console.log(`${num} ${chalk.red(`- ${text}`)}`);
        else console.log(`${num} ${chalk.dim(`  ${text}`)}`);
        lastPrinted = i;
    }
}
