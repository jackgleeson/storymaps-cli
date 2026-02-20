// Storymaps CLI — AGPL-3.0 — see LICENCE for details
// storymaps pull — download a map from the remote server

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import jsyaml from 'js-yaml';
import { exportToYaml, yamlObjToJson } from '../core/yaml.js';
import { detectFormat, writeCache } from '../util/file.js';
import { resolveTarget } from '../util/identity.js';
import { getMap } from '../util/api.js';
import { printChangeSummary } from '../util/summary.js';

function normalise(content, format) {
    if (format === 'json') {
        return exportToYaml(JSON.parse(content));
    }
    const obj = jsyaml.load(content);
    return exportToYaml(yamlObjToJson(obj));
}

export async function pullCommand(target, opts) {
    const filePath = resolve(opts.file || 'storymap.yml');
    const { id, baseUrl } = await resolveTarget(target, filePath);

    const { data, etag } = await getMap(baseUrl, id, 'yaml');

    if (existsSync(filePath)) {
        const oldContent = await readFile(filePath, 'utf-8');

        // Quick check: if raw content is identical, nothing to do
        if (oldContent === data) {
            if (etag) await writeCache(id, { etag });
            console.log(chalk.dim('Already up to date.'));
            return;
        }

        // Show what would change before asking
        try {
            const format = detectFormat(filePath);
            const oldYaml = normalise(oldContent, format);
            const obj = jsyaml.load(data);
            const newYaml = exportToYaml(yamlObjToJson(obj));
            if (oldYaml !== newYaml) {
                printChangeSummary(oldYaml, newYaml);
            }
        } catch {
            // Continue even if summary fails
        }

        if (!opts.force) {
            const overwrite = await confirm({
                message: 'Apply changes?',
                default: true,
                theme: { prefix: '>' },
            });
            if (!overwrite) {
                console.log('Aborted.');
                return;
            }
        }
    }

    await writeFile(filePath, data, 'utf-8');
    if (etag) {
        await writeCache(id, { etag });
    }
    console.log(chalk.green(`Pulled map ${id} → ${filePath}`));
}
