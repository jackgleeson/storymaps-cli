// Storymaps CLI — AGPL-3.0 — see LICENCE for details
// storymaps validate — validate a storymap file

import { existsSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import chalk from 'chalk';
import { readStorymap } from '../util/file.js';
import { validateYaml } from '../core/yaml.js';

export async function validateCommand(file) {
    // A folder, such as storymaps: every map file in it
    if (existsSync(file) && statSync(file).isDirectory()) {
        const names = (await readdir(file)).filter(n => /\.ya?ml$/i.test(n)).sort();
        let bad = 0;
        for (const name of names) {
            const path = join(file, name);
            let result;
            try {
                result = validateYaml(await readStorymap(path));
            } catch (err) {
                result = { valid: false, errors: [err.message], warnings: [] };
            }
            if (result.valid) {
                console.log(`  ${name}  ${chalk.green('valid')}${result.warnings.length ? chalk.yellow(`, ${result.warnings.length} warning${result.warnings.length === 1 ? '' : 's'}`) : ''}`);
            } else {
                bad++;
                console.log(`  ${name}  ${chalk.red('not valid')}`);
                for (const err of result.errors) console.error(chalk.red(`    - ${err}`));
            }
            for (const warn of result.warnings) console.warn(chalk.yellow(`    - ${warn}`));
        }
        if (!names.length) console.log(chalk.dim(`No map files in ${file}.`));
        else if (!bad) console.log(chalk.green(`All ${names.length} maps are valid.`));
        process.exit(bad ? 1 : 0);
    }

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
