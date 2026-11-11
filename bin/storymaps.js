#!/usr/bin/env node
// Storymaps CLI — AGPL-3.0 — see LICENCE for details

import { readFileSync } from 'node:fs';
import chalk from 'chalk';
import { Command } from 'commander';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
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
import { logCommand } from '../lib/commands/log.js';
import { backupCommand, backupsCommand, restoreCommand } from '../lib/commands/backup.js';
import { projectInitCommand, projectAddCommand, projectLockCommand, projectUnlockCommand } from '../lib/commands/project.js';


const program = new Command();

program
    .name('storymaps')
    .description('CLI companion for storymaps.io: manage user story maps from the terminal')
    .version(pkg.version)
    .showHelpAfterError()
    .addHelpText('after', '\nRun storymaps <command> --help for details on a specific command.');

const FILE_HELP = 'one map\'s file (default: storymap.yml, or every map in a project folder)';
const DIR_HELP = 'the project folder (default: storymaps)';

program
    .command('init')
    .description('Create a new storymap.yml in the current directory')
    .option('-s, --site <site>', 'target site (e.g. localhost, storymaps.io)')
    .action(initCommand);

program
    .command('validate')
    .description('Validate a storymap YAML or JSON file, or every map file in a folder')
    .argument('<file>', 'path to a storymap file, or a folder such as storymaps')
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
    .description('Download a map, or a whole project, from the remote server')
    .argument('[target]', 'map ID, domain/ID, full URL, or a project link such as storymaps.io/p/<project>')
    .option('-f, --file <path>', FILE_HELP)
    .option('--dir <folder>', DIR_HELP)
    .option('--force', 'overwrite local files without asking')
    .option('-y, --yes', 'take the default answers, such as just the map for a link to a map in a project')
    .action(pullCommand);

program
    .command('push')
    .description('Upload a local map, or every map in a project folder, to the remote server')
    .argument('[target]', 'map ID, domain/ID, or full URL')
    .option('-f, --file <path>', FILE_HELP)
    .option('--dir <folder>', DIR_HELP)
    .option('--force', 'skip conflict check and overwrite remote')
    .action(pushCommand);

program
    .command('diff')
    .description('Compare a local file against the remote or another local file, or every map in a project folder')
    .argument('[source]', 'local file to compare (default: storymap.yml)')
    .argument('[target]', 'second local file (omit to compare against remote)')
    .option('--full', 'show the full file instead of just changed regions')
    .option('--dir <folder>', DIR_HELP)
    .action(diffCommand);

program
    .command('open')
    .description('Open a map, or a project, in the default browser')
    .argument('[target]', 'map ID, domain/ID, or full URL')
    .option('-f, --file <path>', FILE_HELP)
    .option('--dir <folder>', DIR_HELP)
    .action(openCommand);

program
    .command('lock')
    .description('Password-protect a map. For a whole project, use storymaps project lock')
    .argument('[target]', 'map ID, domain/ID, or full URL')
    .option('-f, --file <path>', 'local file path (default: storymap.yml)')
    .action(lockCommand);

program
    .command('unlock')
    .description('Unlock a password-protected map. For a whole project, use storymaps project unlock')
    .argument('[target]', 'map ID, domain/ID, or full URL')
    .option('-f, --file <path>', 'local file path (default: storymap.yml)')
    .option('--remove', 'permanently remove the lock instead of session unlock')
    .action(unlockCommand);

program
    .command('status')
    .description('Show a progress overview of the story map, or of every map in a project')
    .argument('[target]', 'storymap file, a map ID, domain/ID, full URL, or a project link')
    .option('-f, --file <path>', FILE_HELP)
    .option('--dir <folder>', DIR_HELP)
    .action(statusCommand);

program
    .command('log')
    .description('Show activity log for a map')
    .argument('[target]', 'map ID, domain/ID, or full URL')
    .option('-f, --file <path>', 'local file path (default: storymap.yml)')
    .action(logCommand);

program
    .command('backup')
    .description('Back up a map, or every map in a project folder, on the server')
    .argument('[target]', 'map ID, domain/ID, or full URL')
    .option('-f, --file <path>', FILE_HELP)
    .option('--dir <folder>', DIR_HELP)
    .option('-m, --message <note>', 'a note to tell the backup apart')
    .action(backupCommand);

program
    .command('backups')
    .description('List the backups of a map, newest first, or the newest backup of each map in a project')
    .argument('[target]', 'map ID, domain/ID, or full URL')
    .option('-f, --file <path>', FILE_HELP)
    .option('--dir <folder>', DIR_HELP)
    .action(backupsCommand);

program
    .command('restore')
    .description('Restore a map from one of its backups, after backing up the map as it is now')
    .argument('<backup-id>', 'the ID of a backup, from storymaps backups')
    .argument('[target]', 'map ID, domain/ID, or full URL')
    .option('-f, --file <path>', 'local file path (default: storymap.yml, or the map the backup belongs to in a project folder)')
    .option('--dir <folder>', DIR_HELP)
    .option('--force', 'restore without asking first')
    .action(restoreCommand);

// Commands that change a project itself. The other commands work on its maps.
const project = program
    .command('project')
    .description('Start a project, add maps to it, or lock and unlock it');

project
    .command('init')
    .description('Start a project with a first map, or with a map from each file, in storymaps/')
    .argument('[files...]', 'map files to start the project from; they are left as they are')
    .option('--name <name>', 'the project name (default: Untitled project)')
    .option('--dir <folder>', DIR_HELP)
    .option('-s, --site <site>', 'target site (e.g. localhost, storymaps.io)')
    .action(projectInitCommand);

project
    .command('add')
    .description('Add a map to the project: a new map, a map from a file, or an existing map')
    .argument('[map]', 'a map file, or an existing map by ID or link (default: a new blank map)')
    .option('--name <name>', 'the name of a new map (default: My Story Map)')
    .option('--dir <folder>', DIR_HELP)
    .option('--project <link>', 'the project, by link or ID, when there is no project folder yet')
    .action(projectAddCommand);

project
    .command('lock')
    .description('Lock the project, or the project and its maps')
    .option('--maps', 'lock the maps that are not locked too, without asking')
    .option('-y, --yes', 'take the default answer: the project alone')
    .option('--dir <folder>', DIR_HELP)
    .option('--project <link>', 'the project, by link or ID, when there is no project folder')
    .action(projectLockCommand);

project
    .command('unlock')
    .description('Unlock the project on this computer, or remove its lock for everyone')
    .option('--remove', 'remove the lock for everyone')
    .option('--maps', 'also unlock, or with --remove remove the lock from, the maps that use the project password')
    .option('-y, --yes', 'take the default answers: the project only, and the map locks kept')
    .option('--dir <folder>', DIR_HELP)
    .option('--project <link>', 'the project, by link or ID, when there is no project folder')
    .action(projectUnlockCommand);

program.parseAsync().catch(err => {
    const message = err.name === 'ExitPromptError' ? 'Cancelled.'
        // fetch says only "fetch failed" when the server can't be reached
        : err.message === 'fetch failed' ? `Couldn't reach the server${err.cause?.code ? ` (${err.cause.code})` : ''}. Check your connection, or the site in the map file, and try again.`
        : err.message || String(err);
    // A stop the CLI chose says what to do in its own words
    if (err.name === 'StopError') {
        console.error(chalk.red(message.split('\n')[0]) + (message.includes('\n') ? `\n${message.split('\n').slice(1).join('\n')}` : ''));
        process.exitCode = 1;
        return;
    }
    console.error(chalk.red(message));
    process.exitCode = 1;
});
