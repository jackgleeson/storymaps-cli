#!/usr/bin/env node
// Storymaps CLI — AGPL-3.0 — see LICENCE for details

import chalk from 'chalk';
import { Command } from 'commander';
import { initCommand } from '../lib/commands/init.js';
import { validateCommand } from '../lib/commands/validate.js';
import { convertCommand } from '../lib/commands/convert.js';
import { pullCommand } from '../lib/commands/pull.js';
import { pushCommand } from '../lib/commands/push.js';
import { diffCommand } from '../lib/commands/diff.js';
import { openCommand } from '../lib/commands/open.js';
import { lockCommand } from '../lib/commands/lock.js';
import { unlockCommand } from '../lib/commands/unlock.js';
import { statusCommand } from '../lib/commands/status.js';

const program = new Command();

program
    .name('storymaps')
    .description('CLI companion for storymaps.io — manage user story maps from the terminal')
    .version('0.0.1')
    .showHelpAfterError()
    .addHelpText('after', '\nRun storymaps <command> --help for details on a specific command.');

program
    .command('init')
    .description('Create a new storymap.yml in the current directory')
    .option('-s, --site <site>', 'target site (e.g. localhost, storymaps.io)')
    .action(initCommand);

program
    .command('validate')
    .description('Validate a storymap YAML or JSON file')
    .argument('<file>', 'path to storymap file')
    .action(validateCommand);

program
    .command('convert')
    .description('Convert between YAML and JSON formats')
    .argument('<file>', 'path to storymap file')
    .option('--from <format>', 'source format (yaml or json)')
    .option('--to <format>', 'target format (yaml or json)', 'yaml')
    .option('--out <file>', 'output file (default: stdout)')
    .action(convertCommand);

program
    .command('pull')
    .description('Download a map from the remote server')
    .argument('[target]', 'map ID, domain/ID, or full URL')
    .option('-f, --file <path>', 'local file path', 'storymap.yml')
    .option('--force', 'overwrite local file without prompting')
    .action(pullCommand);

program
    .command('push')
    .description('Upload a local map to the remote server')
    .argument('[target]', 'map ID, domain/ID, or full URL')
    .option('-f, --file <path>', 'local file path', 'storymap.yml')
    .option('--force', 'skip conflict check and overwrite remote')
    .action(pushCommand);

program
    .command('diff')
    .description('Compare a local file against the remote or another local file')
    .argument('[source]', 'local file to compare (default: storymap.yml)')
    .argument('[target]', 'second local file (omit to compare against remote)')
    .option('--full', 'show the full file instead of just changed regions')
    .action(diffCommand);

program
    .command('open')
    .description('Open a map in the default browser')
    .argument('[target]', 'map ID, domain/ID, or full URL')
    .option('-f, --file <path>', 'local file path', 'storymap.yml')
    .action(openCommand);

program
    .command('lock')
    .description('Password-protect a map')
    .argument('[target]', 'map ID, domain/ID, or full URL')
    .option('-f, --file <path>', 'local file path', 'storymap.yml')
    .action(lockCommand);

program
    .command('unlock')
    .description('Unlock a password-protected map')
    .argument('[target]', 'map ID, domain/ID, or full URL')
    .option('-f, --file <path>', 'local file path', 'storymap.yml')
    .option('--remove', 'permanently remove the lock instead of session unlock')
    .action(unlockCommand);

program
    .command('status')
    .description('Show a progress overview of the story map')
    .argument('[file]', 'path to storymap file')
    .option('-f, --file <path>', 'path to storymap file', 'storymap.yml')
    .action(statusCommand);

program.parseAsync().catch(err => {
    const message = err.name === 'ExitPromptError' ? 'Cancelled.'
        : err.message || String(err);
    console.error(chalk.red(message));
    process.exitCode = 1;
});
