// Storymaps CLI — AGPL-3.0 — see LICENCE for details
// storymaps push — upload a local map to the remote server

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import chalk from 'chalk';
import { password } from '@inquirer/prompts';
import jsyaml from 'js-yaml';
import { importFromYaml } from '../core/yaml.js';
import { resolveTarget } from '../util/identity.js';
import { getMap, putMap, postMap, ApiError } from '../util/api.js';
import { detectFormat, readCache, writeCache } from '../util/file.js';

function siteToBaseUrl(site) {
    if (!site) return 'https://storymaps.io';
    if (site === 'localhost') return 'http://localhost:3000';
    return `https://${site}`;
}

export async function pushCommand(target, opts) {
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
        // No ID in file — create a new map on the server
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

        const url = `${baseUrl}/${id}`;
        console.log(chalk.green(`Created new map: ${url}`));
        return;
    }

    const contentType = format === 'json' ? 'application/json' : 'text/yaml';

    const cache = await readCache(id);
    let etag = opts.force ? undefined : cache.etag;
    let lockPasswordHash = cache.hash;

    try {
        await putMap(baseUrl, id, content, { etag, contentType, lockPasswordHash });
    } catch (err) {
        if (err instanceof ApiError && err.conflict) {
            console.error(chalk.red('Conflict — the remote map has changed since you last pulled.'));
            console.error(`Run ${chalk.cyan('storymaps pull')} to update, or use ${chalk.cyan('--force')} to overwrite.`);
            process.exit(1);
        }
        if (err instanceof ApiError && err.status === 423) {
            console.log(chalk.yellow('Map is locked.'));
            const pw = await password({ theme: { prefix: '>' }, message: 'Password:' });
            lockPasswordHash = createHash('sha256').update(pw).digest('hex');
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

    // Refresh saved etag so the next push is also protected
    try {
        const remote = await getMap(baseUrl, id);
        if (remote.etag) {
            await writeCache(id, { etag: remote.etag });
        }
    } catch { /* non-fatal */ }

    const url = `${baseUrl}/${id}`;
    console.log(chalk.green(`Pushed to ${url}`));
}
