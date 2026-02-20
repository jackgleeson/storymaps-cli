// Storymaps CLI — AGPL-3.0 — see LICENCE for details
// storymaps init — create a new storymap.yml

import { writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { confirm } from '@inquirer/prompts';
import chalk from 'chalk';

const TEMPLATE = `\
name: My Story Map
site: localhost
users:
  - name: User Type
    color: "#fca5a5"
    step: New Step
activities:
  - name: New Activity
    color: "#93c5fd"
    step: New Step
steps:
  - New Step
legend:
  - color: "#fef08a"
    label: Tasks
  - color: "#a5f3fc"
    label: Notes
  - color: "#bef264"
    label: Questions
  - color: "#fecdd3"
    label: Edge cases
slices:
  - name: ""
    stories:
      New Step:
        - name: New Task or Detail
notes: >-
  Thanks for trying Storymaps.io! If you find it useful, please consider starring the open-source repo:
  https://github.com/jackgleeson/storymaps.io

  Have a great day!
`;

function highlightYaml(yaml) {
    return yaml.split('\n').map(line => {
        // Quoted strings
        line = line.replace(/"([^"]*)"/g, (_, s) => chalk.yellow(`"${s}"`));
        // Keys (word followed by colon)
        line = line.replace(/^(\s*-?\s*)(\w[\w\s]*?)(:)/gm, (_, prefix, key, colon) =>
            `${prefix}${chalk.cyan(key)}${colon}`
        );
        // List dashes
        line = line.replace(/^(\s*)(- )/, (_, indent, dash) =>
            `${indent}${chalk.dim(dash)}`
        );
        return line;
    }).join('\n');
}

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
    console.log(chalk.green('Created storymap.yml\n'));
    console.log(highlightYaml(TEMPLATE));
}
