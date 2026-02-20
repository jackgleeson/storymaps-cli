// Storymaps CLI — AGPL-3.0 — see LICENCE for details
// storymaps convert — convert between YAML and JSON formats

import { readFile, writeFile } from 'node:fs/promises';
import jsyaml from 'js-yaml';
import chalk from 'chalk';
import { detectFormat } from '../util/file.js';
import { exportToYaml, yamlObjToJson } from '../core/yaml.js';

export async function convertCommand(file, opts) {
    const from = opts.from || detectFormat(file);
    const to = opts.to || 'yaml';

    if (from === to) {
        console.error(chalk.red(`Source and target formats are both ${from}. Nothing to convert.`));
        process.exit(1);
    }

    const content = await readFile(file, 'utf-8');
    let output;

    if (from === 'yaml' && to === 'json') {
        const obj = jsyaml.load(content);
        const json = yamlObjToJson(obj);
        output = JSON.stringify(json, null, 2) + '\n';
    } else if (from === 'json' && to === 'yaml') {
        const json = JSON.parse(content);
        output = exportToYaml(json);
    } else {
        console.error(chalk.red(`Unsupported conversion: ${from} → ${to}`));
        process.exit(1);
    }

    if (opts.out) {
        await writeFile(opts.out, output, 'utf-8');
        console.log(chalk.green(`Written to ${opts.out}`));
    } else {
        process.stdout.write(output);
    }
}
