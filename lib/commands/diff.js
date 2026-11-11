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
import { printFullDiff } from '../util/full-diff.js';
import { findProjectFolder } from '../util/project.js';
import { diffProject } from './project-sync.js';

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
    // No files named in a project folder: every map against the server
    if (!source) {
        const ctx = await findProjectFolder({ dir: opts.dir });
        if (ctx?.projectId) {
            await diffProject(ctx, { full: opts.full });
            return;
        }
    }

    const sourcePath = resolve(source || 'storymap.yml');
    const sourceYaml = await readAndNormalise(sourcePath);

    // Show changes from old to new. Two local files go from the first to the second. Against the
    // remote, the local file is the new side, so the diff shows what a push would change.
    let oldYaml, newYaml, oldLabel, newLabel;

    if (target) {
        // Two local files
        const targetPath = resolve(target);
        oldYaml = sourceYaml;
        newYaml = await readAndNormalise(targetPath);
        oldLabel = sourcePath;
        newLabel = targetPath;
    } else {
        // Local vs remote
        const { id, baseUrl } = await resolveTarget(undefined, sourcePath);
        const { data } = await getMap(baseUrl, id, 'yaml');
        // Normalise remote YAML the same way
        const obj = jsyaml.load(data);
        const json = yamlObjToJson(obj);
        oldYaml = exportToYaml(json);
        newYaml = sourceYaml;
        oldLabel = `remote: ${baseUrl}/${id}`;
        newLabel = `local: ${sourcePath}`;
    }

    const changes = diffLines(oldYaml, newYaml);
    const hasChanges = changes.some(c => c.added || c.removed);

    if (!hasChanges) {
        console.log(chalk.dim('No differences.'));
        return;
    }

    if (!opts.full) {
        printChangeSummary(oldYaml, newYaml);
        console.log(chalk.dim(`\nRun ${chalk.cyan('storymaps diff --full')} for the full file diff.`));
        return;
    }

    console.log(chalk.bold(`--- ${oldLabel}`));
    console.log(chalk.bold(`+++ ${newLabel}`));
    printFullDiff(changes);
}
