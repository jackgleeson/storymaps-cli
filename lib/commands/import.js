// Storymaps CLI — AGPL-3.0 — see LICENCE for details
// storymaps import — import tasks from an external tool into a storymap

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import chalk from 'chalk';
import { input, password, confirm } from '@inquirer/prompts';
import { readCredentials, writeCredentials, writeStorymap } from '../util/file.js';
import { dumpYaml } from '../core/yaml.js';
import { postMap } from '../util/api.js';
import {
    findProject,
    findEpicTagPhid,
    fetchTasks,
    fetchTasksByPhids,
    fetchSubtaskEdges,
    CLI_TO_PHAB_STATUS,
    PHAB_TO_STORYMAP_STATUS,
} from '../util/phabricator.js';

const CARDS_PER_COLUMN = 10;

async function promptCredentials(defaultUrl) {
    const url = await input({
        message: 'Phabricator instance URL:',
        default: defaultUrl,
        theme: { prefix: '>' },
        validate: v => v.startsWith('http') || 'Must be a full URL (https://...)',
    });
    console.log();
    console.log(chalk.dim('  To get your API token:'));
    console.log(chalk.dim('  1. Click your profile picture in Phabricator'));
    console.log(chalk.dim('  2. Go to Settings'));
    console.log(chalk.dim('  3. Click "Conduit API Tokens"'));
    console.log(chalk.dim('  4. Click "Generate Token"'));
    console.log();
    const token = await password({
        message: 'API token:',
        mask: '*',
        theme: { prefix: '>' },
    });
    return { url: url.replace(/\/+$/, ''), token };
}

async function getCredentials() {
    const saved = await readCredentials('phabricator');
    if (saved?.url && saved?.token) {
        console.log(chalk.dim(`Using saved Phabricator credentials (${saved.url})`));
        return saved;
    }
    const creds = await promptCredentials(saved?.url);
    await writeCredentials('phabricator', creds);
    console.log(chalk.dim('Credentials saved to ~/.storymaps/credentials.json'));
    return creds;
}

function buildYamlObj(projectName, epics, standalones, baseUrl, site) {
    const steps = [];
    const importedStories = {};
    const backlogStories = {};

    // Epic steps + stories
    for (const epic of epics) {
        const step = { name: epic.name };
        if (epic.description) step.body = epic.description;
        step.url = `${baseUrl}/T${epic.id}`;
        if (epic.points != null) step.points = epic.points;
        steps.push(step);
        importedStories[epic.name] = epic.children.map(task => taskToCard(task, baseUrl));
    }

    // Backlog columns
    const numColumns = Math.max(1, Math.ceil(standalones.length / CARDS_PER_COLUMN));
    for (let col = 0; col < numColumns; col++) {
        const stepName = String(col + 1);
        steps.push(stepName);
        const chunk = standalones.slice(col * CARDS_PER_COLUMN, (col + 1) * CARDS_PER_COLUMN);
        if (chunk.length) {
            backlogStories[stepName] = chunk.map(task => taskToCard(task, baseUrl));
        }
    }

    const slices = [];
    if (Object.keys(importedStories).length) {
        slices.push({ name: 'Imported', stories: importedStories });
    }
    if (Object.keys(backlogStories).length) {
        slices.push({ name: 'Backlog', stories: backlogStories });
    }

    const obj = { name: projectName, id: undefined, site, steps, slices };
    return obj;
}

function taskToCard(task, baseUrl) {
    const card = { name: task.name };
    const status = PHAB_TO_STORYMAP_STATUS[task.status];
    if (status) card.status = status;
    if (task.description) card.body = task.description;
    if (task.points != null) card.points = task.points;
    card.url = `${baseUrl}/T${task.id}`;
    return card;
}

export async function importCommand(opts) {
    const source = opts.from === 'phab' ? 'phabricator' : opts.from;
    if (source !== 'phabricator') {
        console.error(chalk.red(`Unsupported source: ${source}. Supported: phabricator (or phab)`));
        process.exit(1);
    }

    const tag = opts.tag;
    if (!tag) {
        console.error(chalk.red('--tag is required'));
        process.exit(1);
    }

    const outputPath = resolve(opts.output || 'storymap.yml');
    const statusList = (opts.status || 'open,in-progress,stalled,resolved').split(',').map(s => s.trim());

    // Validate status names
    for (const s of statusList) {
        if (!CLI_TO_PHAB_STATUS[s]) {
            console.error(chalk.red(`Unknown status: ${s}. Valid: ${Object.keys(CLI_TO_PHAB_STATUS).join(', ')}`));
            process.exit(1);
        }
    }

    const phabStatuses = statusList.map(s => CLI_TO_PHAB_STATUS[s]);

    // Credentials
    let { url: baseUrl, token } = await getCredentials();

    // Resolve project (retry on auth error)
    console.log(chalk.dim(`Looking up project "${tag}"...`));
    let project;
    try {
        project = await findProject(baseUrl, token, tag);
    } catch (err) {
        if (err.message.includes('ERR-INVALID-AUTH') || err.message.includes('ERR-CONDUIT-CORE')) {
            console.error(chalk.red(err.message));
            console.log();
            const creds = await promptCredentials(baseUrl);
            baseUrl = creds.url;
            token = creds.token;
            try {
                project = await findProject(baseUrl, token, tag);
                await writeCredentials('phabricator', creds);
                console.log(chalk.dim('Credentials saved to ~/.storymaps/credentials.json'));
            } catch (retryErr) {
                console.error(chalk.red(retryErr.message));
                process.exit(1);
            }
        } else {
            console.error(chalk.red(err.message));
            process.exit(1);
        }
    }
    console.log(`Project: ${chalk.cyan(project.name)}`);

    // Fetch tasks and resolve epic tag
    console.log(chalk.dim('Fetching tasks...'));
    let tasks, epicPhid;
    try {
        [tasks, epicPhid] = await Promise.all([
            fetchTasks(baseUrl, token, project.phid, phabStatuses),
            findEpicTagPhid(baseUrl, token),
        ]);
    } catch (err) {
        console.error(chalk.red(`Failed to fetch tasks: ${err.message}`));
        process.exit(1);
    }

    if (!tasks.length) {
        console.log(chalk.yellow('No tasks found.'));
        return;
    }

    // Identify epics by the Epic project tag
    const epicTasks = epicPhid ? tasks.filter(t => t.projectPhids.includes(epicPhid)) : [];
    const epicPhids = new Set(epicTasks.map(t => t.phid));

    // Fetch subtasks for epics
    let edges = [];
    if (epicTasks.length) {
        console.log(chalk.dim('Fetching subtasks...'));
        try {
            edges = await fetchSubtaskEdges(baseUrl, token, epicTasks.map(t => t.phid));
        } catch (err) {
            console.error(chalk.red(`Failed to fetch subtasks: ${err.message}`));
            process.exit(1);
        }
    }

    // Build epic → children map, fetching any subtasks not in the project
    const taskByPhid = new Map(tasks.map(t => [t.phid, t]));
    const childPhids = new Set(edges.map(e => e.destinationPHID));
    const missingPhids = [...childPhids].filter(phid => !taskByPhid.has(phid));
    if (missingPhids.length) {
        const missing = await fetchTasksByPhids(baseUrl, token, missingPhids);
        for (const t of missing) taskByPhid.set(t.phid, t);
    }

    const epics = epicTasks.map(epic => {
        const childTaskPhids = edges
            .filter(e => e.sourcePHID === epic.phid)
            .map(e => e.destinationPHID);
        const children = childTaskPhids.map(phid => taskByPhid.get(phid)).filter(Boolean);
        return { ...epic, children };
    });

    // Standalone = not an epic, not a child of an epic
    const standalones = tasks.filter(t => !epicPhids.has(t.phid) && !childPhids.has(t.phid));

    const subtaskCount = epics.reduce((sum, e) => sum + e.children.length, 0);
    console.log(`  ${epics.length} epics, ${subtaskCount} subtasks`);
    console.log(`  ${standalones.length} standalone tasks`);

    // Build YAML and register on storymaps server
    const site = opts.site || 'storymaps.io';
    const siteBaseUrl = site === 'localhost' ? 'http://localhost:3000' : `https://${site}`;
    const yamlObj = buildYamlObj(project.name, epics, standalones, baseUrl, site);
    let yamlString = dumpYaml(yamlObj);
    try {
        const { id } = await postMap(siteBaseUrl, yamlString, 'text/yaml');
        yamlObj.id = id;
        yamlString = dumpYaml(yamlObj);
        console.log(chalk.dim(`  Registered on ${site} (id: ${id})`));
    } catch {
        console.log(chalk.dim(`  Could not reach ${site} - run "storymaps push" later to register`));
    }

    // Write
    if (existsSync(outputPath)) {
        const overwrite = await confirm({
            message: `${outputPath} already exists. Overwrite?`,
            default: false,
            theme: { prefix: '>' },
        });
        if (!overwrite) {
            console.log('Aborted.');
            return;
        }
    }

    await writeStorymap(outputPath, yamlString);
    console.log(chalk.green(`Wrote ${outputPath}`));
    console.log(chalk.dim(`  ${tasks.length} tasks, ${epics.length} epics, ${standalones.length} standalone`));
}
