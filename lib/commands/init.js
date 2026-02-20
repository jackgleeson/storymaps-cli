// Storymaps CLI — AGPL-3.0 — see LICENCE for details
// storymaps init — create a new storymap.yml

import { writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { confirm } from '@inquirer/prompts';
import chalk from 'chalk';

const TEMPLATE = `\
name: My Story Map

users:
  - name: User
    step: Step 1

activities:
  - name: Activity
    step: Step 1

steps:
  - Step 1

slices:
  - name: Release 1
    stories:
      Step 1:
        - name: First story
`;

export async function initCommand() {
    const filePath = resolve('storymap.yml');

    if (existsSync(filePath)) {
        const overwrite = await confirm({
            message: 'storymap.yml already exists. Overwrite?',
            default: false,
        });
        if (!overwrite) {
            console.log('Aborted.');
            return;
        }
    }

    await writeFile(filePath, TEMPLATE, 'utf-8');
    console.log(chalk.green('Created storymap.yml'));
}
