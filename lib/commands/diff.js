// Storymaps CLI — AGPL-3.0 — see LICENCE for details
// storymaps diff — compare local file vs remote or two local files

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import chalk from 'chalk';
import { diffLines } from 'diff';
import jsyaml from 'js-yaml';
import { exportToYaml, yamlObjToJson } from '../core/yaml.js';
import { detectFormat } from '../util/file.js';
import { resolveTarget } from '../util/identity.js';
import { getMap } from '../util/api.js';
import { printChangeSummary } from '../util/summary.js';

async function readAndNormalise(filePath) {
    const content = await readFile(filePath, 'utf-8');
    const format = detectFormat(filePath);
    if (format === 'json') {
        const json = JSON.parse(content);
        return exportToYaml(json);
    }
    // Round-trip YAML through the model to normalise
    const obj = jsyaml.load(content);
    const json = yamlObjToJson(obj);
    return exportToYaml(json);
}

export async function diffCommand(source, target, opts) {
    const sourcePath = resolve(source || 'storymap.yml');
    const sourceYaml = await readAndNormalise(sourcePath);

    let targetYaml;
    let targetLabel;

    if (target) {
        // Two local files
        const targetPath = resolve(target);
        targetYaml = await readAndNormalise(targetPath);
        targetLabel = targetPath;
    } else {
        // Local vs remote
        const { id, baseUrl } = await resolveTarget(undefined, sourcePath);
        const { data } = await getMap(baseUrl, id, 'yaml');
        // Normalise remote YAML the same way
        const obj = jsyaml.load(data);
        const json = yamlObjToJson(obj);
        targetYaml = exportToYaml(json);
        targetLabel = `${baseUrl}/${id}`;
    }

    const changes = diffLines(sourceYaml, targetYaml);
    const hasChanges = changes.some(c => c.added || c.removed);

    if (!hasChanges) {
        console.log(chalk.dim('No differences.'));
        return;
    }

    if (!opts.full) {
        printChangeSummary(sourceYaml, targetYaml);
        console.log(chalk.dim(`\nRun ${chalk.cyan('storymaps diff --full')} for the full file diff.`));
        return;
    }

    // --full: show line-level diff
    const CONTEXT = 3;
    const lines = [];
    let srcLine = 1;
    let dstLine = 1;
    for (const part of changes) {
        for (const text of part.value.replace(/\n$/, '').split('\n')) {
            if (part.added) {
                lines.push({ tag: '+', text, src: null, dst: dstLine++ });
            } else if (part.removed) {
                lines.push({ tag: '-', text, src: srcLine++, dst: null });
            } else {
                lines.push({ tag: ' ', text, src: srcLine++, dst: dstLine++ });
            }
        }
    }

    const width = String(Math.max(srcLine, dstLine)).length;
    const pad = n => n === null ? ' '.repeat(width) : String(n).padStart(width);

    console.log(chalk.bold(`--- local: ${sourcePath}`));
    console.log(chalk.bold(`+++ remote: ${targetLabel}`));

    let lastPrinted = -1;
    for (let i = 0; i < lines.length; i++) {
        const nearby = lines.slice(Math.max(0, i - CONTEXT), i + CONTEXT + 1);
        if (!nearby.some(l => l.tag !== ' ')) continue;
        if (lastPrinted !== -1 && i - lastPrinted > 1) {
            console.log(chalk.dim(`${'·'.repeat(width * 2 + 5)}`));
        }
        const { tag, text, src, dst } = lines[i];
        const num = chalk.dim(`${pad(src)} ${pad(dst)}`);
        if (tag === '+') console.log(`${num} ${chalk.green(`+ ${text}`)}`);
        else if (tag === '-') console.log(`${num} ${chalk.red(`- ${text}`)}`);
        else console.log(`${num} ${chalk.dim(`  ${text}`)}`);
        lastPrinted = i;
    }
}
