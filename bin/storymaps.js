#!/usr/bin/env node
// Storymaps CLI — AGPL-3.0 — see LICENCE for details

import { Command } from 'commander';
import { initCommand } from '../lib/commands/init.js';
import { validateCommand } from '../lib/commands/validate.js';

const program = new Command();

program
    .name('storymaps')
    .description('CLI companion for storymaps.io — manage user story maps from the terminal')
    .version('0.0.1');

program
    .command('init')
    .description('Create a new storymap.yml in the current directory')
    .action(initCommand);

program
    .command('validate')
    .description('Validate a storymap YAML or JSON file')
    .argument('<file>', 'path to storymap file')
    .action(validateCommand);

program.parse();
