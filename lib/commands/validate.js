// Storymaps CLI — AGPL-3.0 — see LICENCE for details
// storymaps validate — validate a storymap file

import chalk from 'chalk';
import { readStorymap } from '../util/file.js';
import { validateYaml } from '../core/yaml.js';

export async function validateCommand(file) {
    let data;
    try {
        data = await readStorymap(file);
    } catch (err) {
        console.error(chalk.red(`Error reading file: ${err.message}`));
        process.exit(1);
    }

    const result = validateYaml(data);

    if (result.errors.length) {
        console.error(chalk.red(`Errors (${result.errors.length}):`));
        for (const err of result.errors) {
            console.error(chalk.red(`  - ${err}`));
        }
    }

    if (result.warnings.length) {
        console.warn(chalk.yellow(`Warnings (${result.warnings.length}):`));
        for (const warn of result.warnings) {
            console.warn(chalk.yellow(`  - ${warn}`));
        }
    }

    if (result.valid) {
        console.log(chalk.green('Valid storymap.'));
    }

    process.exit(result.valid ? 0 : 1);
}
