// Storymaps CLI — AGPL-3.0 — see LICENCE for details
// Phabricator Conduit API client

// CLI status name → Phabricator Conduit status value
export const CLI_TO_PHAB_STATUS = {
    'open': 'open',
    'in-progress': 'progress',
    'stalled': 'stalled',
    'resolved': 'resolved',
};

// Phabricator Conduit status value → storymap YAML status
export const PHAB_TO_STORYMAP_STATUS = {
    'open': 'planned',
    'progress': 'in-progress',
    'stalled': 'blocked',
    'resolved': 'done',
};

async function conduit(baseUrl, method, token, params = {}) {
    const url = `${baseUrl.replace(/\/+$/, '')}/api/${method}`;
    const args = ['curl', '-s', '-X', 'POST', url, '-d', `api.token=${token}`];
    for (const [key, value] of Object.entries(params)) {
        args.push('-d', `${key}=${value}`);
    }
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const exec = promisify(execFile);
    const { stdout } = await exec(args[0], args.slice(1));
    const json = JSON.parse(stdout);
    if (json.error_code) {
        throw new Error(`Conduit ${method}: [${json.error_code}] ${json.error_info}`);
    }
    return json.result;
}

/**
 * Resolve a project slug to its PHID and name.
 */
export async function findProject(baseUrl, token, slug) {
    const result = await conduit(baseUrl, 'project.search', token, {
        'constraints[slugs][0]': slug,
    });
    const project = result.data?.[0];
    if (!project) {
        throw new Error(`Project not found: ${slug}`);
    }
    return { phid: project.phid, name: project.fields.name };
}

/**
 * Find the PHID of the "Epic" project tag. Returns null if not found.
 */
export async function findEpicTagPhid(baseUrl, token) {
    const result = await conduit(baseUrl, 'project.search', token, {
        'constraints[slugs][0]': 'epic',
    });
    return result.data?.[0]?.phid || null;
}

/**
 * Fetch all tasks in a project matching the given statuses.
 * Handles cursor-based pagination. Calls onPage(tasks, total) per page.
 */
export async function fetchTasks(baseUrl, token, projectPhid, statuses, { onPage } = {}) {
    const all = [];
    let after = null;
    for (;;) {
        const params = {
            'constraints[projects][0]': projectPhid,
            'attachments[projects]': '1',
            'order': 'newest',
        };
        statuses.forEach((s, i) => {
            params[`constraints[statuses][${i}]`] = s;
        });
        if (after) params['after'] = after;

        const result = await conduit(baseUrl, 'maniphest.search', token, params);
        const tasks = (result.data || []).map(t => ({
            id: t.id,
            phid: t.phid,
            name: t.fields.name,
            description: t.fields.description?.raw || '',
            status: t.fields.status?.value || 'open',
            points: t.fields.points != null ? Number(t.fields.points) : null,
            projectPhids: t.attachments?.projects?.projectPHIDs || [],
        }));
        all.push(...tasks);
        if (onPage) onPage(tasks, all.length);

        after = result.cursor?.after;
        if (!after) break;
    }
    return all;
}

/**
 * Fetch tasks by their PHIDs. Returns the same shape as fetchTasks.
 */
export async function fetchTasksByPhids(baseUrl, token, phids) {
    const BATCH = 100;
    const all = [];
    for (let i = 0; i < phids.length; i += BATCH) {
        const batch = phids.slice(i, i + BATCH);
        const params = {};
        batch.forEach((phid, j) => {
            params[`constraints[phids][${j}]`] = phid;
        });
        const result = await conduit(baseUrl, 'maniphest.search', token, params);
        const tasks = (result.data || []).map(t => ({
            id: t.id,
            phid: t.phid,
            name: t.fields.name,
            description: t.fields.description?.raw || '',
            status: t.fields.status?.value || 'open',
            points: t.fields.points != null ? Number(t.fields.points) : null,
            projectPhids: [],
        }));
        all.push(...tasks);
    }
    return all;
}

/**
 * Fetch subtask edges for a set of task PHIDs.
 * Returns [{ sourcePHID, destinationPHID }] where source is parent, destination is child.
 * Handles pagination and batches in chunks of 100.
 */
export async function fetchSubtaskEdges(baseUrl, token, taskPhids) {
    const BATCH = 100;
    const all = [];
    for (let i = 0; i < taskPhids.length; i += BATCH) {
        const batch = taskPhids.slice(i, i + BATCH);
        let after = null;
        for (;;) {
            const params = { 'types[0]': 'task.subtask' };
            batch.forEach((phid, j) => {
                params[`sourcePHIDs[${j}]`] = phid;
            });
            if (after) params['after'] = after;

            const result = await conduit(baseUrl, 'edge.search', token, params);
            const edges = (result.data || []).map(e => ({
                sourcePHID: e.sourcePHID,
                destinationPHID: e.destinationPHID,
            }));
            all.push(...edges);

            after = result.cursor?.after;
            if (!after) break;
        }
    }
    return all;
}
