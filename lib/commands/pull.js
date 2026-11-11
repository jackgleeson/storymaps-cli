// Storymaps CLI — AGPL-3.0 — see LICENCE for details
// storymaps pull — download a map, or a whole project, from the remote server

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import chalk from 'chalk';
import jsyaml from 'js-yaml';
import { exportToYaml, yamlObjToJson } from '../core/yaml.js';
import { detectFormat, writeEtag } from '../util/file.js';
import { resolveTarget, parseProjectLink } from '../util/identity.js';
import { getMap, getProject } from '../util/api.js';
import { printChangeSummary } from '../util/summary.js';
import { findProjectFolder, readProjectFiles, PROJECT_DIR, shortPath } from '../util/project.js';
import { choose, guard, isInteractive } from '../util/prompt.js';
import { pullProject, projectLink } from './project-sync.js';

function normalise(content, format) {
    if (format === 'json') {
        return exportToYaml(JSON.parse(content));
    }
    const obj = jsyaml.load(content);
    return exportToYaml(yamlObjToJson(obj));
}

export async function pullCommand(target, opts) {
    // A project link: the whole project, or one map of it
    const link = parseProjectLink(target);
    if (link && !opts.file) {
        const dir = resolve(opts.dir || PROJECT_DIR);
        if (!link.mapId) {
            await pullProject({ baseUrl: link.baseUrl, projectId: link.projectId, dir, force: opts.force });
            return;
        }
        // The app's address bar always shows a map inside its project, so a map link is what most
        // people paste. The first time, ask which they meant; once the folder holds the project,
        // a map link pulls just that map.
        const held = (await readProjectFiles(dir)).some(f => f.project === link.projectId);
        if (!held) {
            const project = await getProject(link.baseUrl, link.projectId);
            const map = project.maps.find(m => m.id === link.mapId);
            const name = map?.name || link.mapId;
            const asking = isInteractive() && !opts.yes;
            if (asking) console.log(`${name} is one of ${project.maps.length} maps in ${project.name}.`);
            const whole = await choose({
                message: 'Pull:',
                yes: opts.yes,
                defaultValue: false,
                choices: [
                    { name: `Just ${name}`, value: false },
                    { name: `The whole project (${project.maps.length} maps)`, value: true },
                ],
            });
            await pullProject({ baseUrl: link.baseUrl, projectId: link.projectId, dir, force: opts.force, ...(whole ? {} : { mapId: link.mapId }) });
            if (!whole && !asking && project.maps.length > 1) {
                console.log(chalk.dim(`${name} is one of ${project.maps.length} maps in ${project.name}. To pull them all, run`) + ` ${chalk.cyan(`storymaps pull ${projectLink(link.baseUrl, link.projectId).replace(/^https:\/\//, '')}`)}`);
            }
            return;
        }
        await pullProject({ baseUrl: link.baseUrl, projectId: link.projectId, dir, force: opts.force, mapId: link.mapId });
        return;
    }

    // No target in a project folder: refresh every map
    if (!target) {
        const ctx = await findProjectFolder(opts);
        if (ctx?.projectId) {
            await pullProject({ baseUrl: ctx.baseUrl, projectId: ctx.projectId, dir: ctx.dir, force: opts.force });
            return;
        }
    }

    const filePath = resolve(opts.file || 'storymap.yml');
    const { id, baseUrl } = await resolveTarget(target, filePath);

    const { data, etag } = await getMap(baseUrl, id, 'yaml');

    if (existsSync(filePath)) {
        const oldContent = await readFile(filePath, 'utf-8');

        // Quick check: if raw content is identical, nothing to do
        if (oldContent === data) {
            await writeEtag(id, filePath, etag);
            console.log(chalk.dim('Already up to date.'));
            return;
        }

        // Show what would change before asking
        try {
            const format = detectFormat(filePath);
            const oldYaml = normalise(oldContent, format);
            const obj = jsyaml.load(data);
            const newYaml = exportToYaml(yamlObjToJson(obj));
            if (oldYaml !== newYaml) {
                printChangeSummary(oldYaml, newYaml);
            }
        } catch {
            // Continue even if summary fails
        }

        const overwrite = await guard({ message: 'Apply changes?', force: opts.force, stopMessage: `${shortPath(filePath)} was left as it is.` });
        if (!overwrite) {
            console.log('Aborted.');
            return;
        }
    }

    await writeFile(filePath, data, 'utf-8');
    await writeEtag(id, filePath, etag);
    console.log(chalk.green(`Pulled map ${id} → ${filePath}`));
}
