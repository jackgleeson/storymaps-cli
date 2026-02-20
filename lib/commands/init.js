// Storymaps CLI — AGPL-3.0 — see LICENCE for details
// storymaps init — create a new storymap.yml

import { writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { postMap } from '../util/api.js';

function template(site) {
    const siteLine = site ? `site: ${site}\n` : '';
    return `\
name: My Story Map
${siteLine}users:
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
}

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

export async function initCommand(opts) {
    const filePath = resolve('storymap.yml');

    if (existsSync(filePath)) {
        const overwrite = await confirm({
            message: 'storymap.yml already exists. Overwrite?',
            default: false,
            theme: { prefix: '>' },
        });
        if (!overwrite) {
            console.log('Aborted.');
            return;
        }
    }

    const site = opts.site || 'storymaps.io';
    const baseUrl = site === 'localhost' ? 'http://localhost:3000'
        : `https://${site}`;

    let output = template(site);
    try {
        const { id } = await postMap(baseUrl, output, 'text/yaml');
        output = output.replace(/^(name: My Story Map\n)/, `$1id: ${id}\n`);
        console.log(chalk.green(`Created storymap.yml (map ID: ${id})\n`));
    } catch {
        console.log(chalk.green('Created storymap.yml\n'));
        console.log(chalk.dim('Tip: run "storymaps push" to upload the map when you\'re ready to sync.\n'));
    }

    await writeFile(filePath, output, 'utf-8');
    console.log(highlightYaml(output));
}
