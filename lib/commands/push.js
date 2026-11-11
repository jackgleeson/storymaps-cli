// Storymaps CLI — AGPL-3.0 — see LICENCE for details
// storymaps push — upload a local map to the remote server

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import chalk from 'chalk';
import jsyaml from 'js-yaml';
import { exportToYaml, importFromYaml, yamlObjToJson } from '../core/yaml.js';
import { printChangeSummary } from '../util/summary.js';
import { resolveTarget, siteToBaseUrl } from '../util/identity.js';
import { getMap, putMap, postMap, ApiError } from '../util/api.js';
import { detectFormat, readCache, readEtag, writeEtag } from '../util/file.js';
import { findProjectFolder } from '../util/project.js';
import { askPassword, isInteractive, PASSWORD_ENV } from '../util/prompt.js';
import { pushProject } from './project-sync.js';

// The map as it is on the server now is what this file matches, so a later push from it stops if
// the map changes in the meantime
async function rememberEtag(baseUrl, id, filePath) {
    try {
        const { etag } = await getMap(baseUrl, id);
        await writeEtag(id, filePath, etag);
    } catch { /* non-fatal */ }
}


export async function pushCommand(target, opts) {
    // No target or -f in a project folder: every map in the project
    if (!target) {
        const ctx = await findProjectFolder(opts);
        if (ctx?.projectId) {
            await pushProject(ctx, { force: opts.force });
            return;
        }
    }

    const filePath = resolve(opts.file || 'storymap.yml');

    let content;
    try {
        content = await readFile(filePath, 'utf-8');
    } catch {
        console.error(chalk.red(`File not found: ${filePath}`));
        process.exit(1);
    }

    // Validate before making any API calls
    const format = detectFormat(filePath);
    try {
        if (format === 'yaml') {
            importFromYaml(content);
        } else {
            JSON.parse(content);
        }
    } catch (err) {
        console.error(chalk.red('Validation failed:'));
        console.error(err.message);
        process.exit(1);
    }

    let id, baseUrl;
    try {
        ({ id, baseUrl } = await resolveTarget(target, filePath));
    } catch {
        // No ID in the file: create a new map on the server
        const obj = jsyaml.load(content);
        baseUrl = siteToBaseUrl(obj?.site);
        const contentType = format === 'json' ? 'application/json' : 'text/yaml';
        const result = await postMap(baseUrl, content, contentType);
        id = result.id;

        // Stamp the ID into the local file
        let updated;
        if (/^name:\s/m.test(content)) {
            updated = content.replace(/^(name:\s.+)$/m, `$1\nid: ${id}`);
        } else {
            updated = `id: ${id}\n${content}`;
        }
        await writeFile(filePath, updated, 'utf-8');
        await rememberEtag(baseUrl, id, filePath);

        const url = `${baseUrl}/${id}`;
        console.log(chalk.green(`Created new map: ${url}`));
        return;
    }

    const contentType = format === 'json' ? 'application/json' : 'text/yaml';

    // Show a change summary before pushing
    try {
        const { data: remoteData } = await getMap(baseUrl, id, 'yaml');
        const remoteNorm = exportToYaml(yamlObjToJson(jsyaml.load(remoteData)));
        const localNorm = exportToYaml(yamlObjToJson(jsyaml.load(content)));
        if (remoteNorm !== localNorm) printChangeSummary(remoteNorm, localNorm);
    } catch { /* non-fatal */ }

    let etag = opts.force ? undefined : await readEtag(id, filePath);
    let lockPasswordHash = (await readCache(id)).hash;

    try {
        await putMap(baseUrl, id, content, { etag, contentType, lockPasswordHash });
    } catch (err) {
        if (err instanceof ApiError && err.conflict) {
            console.error(chalk.red('Conflict: the remote map has changed since you last pulled.'));
            console.error(`Run ${chalk.cyan('storymaps pull')} to update, or use ${chalk.cyan('--force')} to overwrite.`);
            process.exit(1);
        }
        if (err instanceof ApiError && err.status === 423) {
            if (!process.env[PASSWORD_ENV] && isInteractive()) console.log(chalk.yellow('Map is locked.'));
            lockPasswordHash = await askPassword({ noPasswordMessage: `This map is locked, and there's no terminal to type its password in. Nothing was pushed. Run storymaps unlock in a terminal first, or set ${PASSWORD_ENV} for this command.` });
            try {
                await putMap(baseUrl, id, content, { etag, contentType, lockPasswordHash });
            } catch (retryErr) {
                if (retryErr instanceof ApiError && retryErr.status === 423) {
                    console.error(chalk.red('Incorrect password.'));
                    process.exit(1);
                }
                throw retryErr;
            }
        } else {
            throw err;
        }
    }

    // Refresh this file's ETag so the next push from it is also protected
    await rememberEtag(baseUrl, id, filePath);

    // A map in a project shows at its project link
    const project = format === 'yaml' ? jsyaml.load(content)?.project : JSON.parse(content).project;
    const url = project ? `${baseUrl}/p/${project}/${id}` : `${baseUrl}/${id}`;
    console.log(chalk.green(`Pushed to ${url}`));
}
