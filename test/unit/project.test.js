import { describe, test, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    setProjectKey, removeProjectKey, setIdKey, setSiteKey, siteOfBaseUrl, readProjectFiles, findProjectFolder,
    defaultProjectDir,
} from '../../lib/util/project.js';
import { choose, ask, guard, askPassword, hashPassword, StopError, PASSWORD_ENV } from '../../lib/util/prompt.js';
import { listNames } from '../../lib/util/passwords.js';

describe('header keys in a map file', () => {
    test('project goes straight after id, replacing any it had', () => {
        assert.equal(setProjectKey('name: CLI\nid: 1g2pt83x\nsite: storymaps.io\n', 'jas75z7l'), 'name: CLI\nid: 1g2pt83x\nproject: jas75z7l\nsite: storymaps.io\n');
        assert.equal(setProjectKey('name: CLI\nid: a\nproject: old\n', 'new'), 'name: CLI\nid: a\nproject: new\n');
        assert.equal(setProjectKey('name: New\nsteps: []\n', 'p'), 'name: New\nproject: p\nsteps: []\n');
    });

    test('taking the project key out leaves the rest of the file alone', () => {
        assert.equal(removeProjectKey('name: CLI\nid: a\nproject: p\nsite: s\n'), 'name: CLI\nid: a\nsite: s\n');
        assert.equal(removeProjectKey('name: CLI\n'), 'name: CLI\n');
    });

    test('id goes straight after name, and site after project unless the file has one', () => {
        assert.equal(setIdKey('name: X\nid: old\nsteps: []\n', 'new'), 'name: X\nid: new\nsteps: []\n');
        assert.equal(setSiteKey('name: X\nid: a\nproject: p\nsteps: []\n', 'localhost:3312'), 'name: X\nid: a\nproject: p\nsite: localhost:3312\nsteps: []\n');
        assert.equal(setSiteKey('name: X\nsite: storymaps.io\n', 'other'), 'name: X\nsite: storymaps.io\n');
    });

    test('a server address becomes the site a map file names', () => {
        assert.equal(siteOfBaseUrl('https://storymaps.io'), 'storymaps.io');
        assert.equal(siteOfBaseUrl('http://localhost:3000'), 'localhost');
        assert.equal(siteOfBaseUrl('http://localhost:3312'), 'localhost:3312');
    });
});

describe('project folders', () => {
    let root, cwd;
    const map = (name, id, project) => `name: ${name}\n${id ? `id: ${id}\n` : ''}${project ? `project: ${project}\n` : ''}site: storymaps.io\nsteps:\n  - A\n`;
    before(() => {
        cwd = process.cwd();
        root = mkdtempSync(join(tmpdir(), 'storymaps-project-'));
    });
    after(() => {
        process.chdir(cwd);
        rmSync(root, { recursive: true, force: true });
    });
    const repo = (name) => {
        const dir = join(root, name);
        mkdirSync(join(dir, 'storymaps'), { recursive: true });
        process.chdir(dir);
        return dir;
    };

    test('a repo with storymaps/ is a project folder, and other YAML files are left out', async () => {
        const dir = repo('a');
        writeFileSync(join(dir, 'storymaps', 'aaaa1111.yml'), map('Ordering', 'aaaa1111', 'proj1234'));
        writeFileSync(join(dir, 'storymaps', 'bbbb2222.yml'), map('Loyalty', 'bbbb2222', 'proj1234'));
        writeFileSync(join(dir, 'docker-compose.yml'), 'services: {}\n');
        const ctx = await findProjectFolder({});
        assert.equal(ctx.projectId, 'proj1234');
        assert.equal(ctx.baseUrl, 'https://storymaps.io');
        assert.deepEqual(ctx.files.map(f => f.name), ['aaaa1111.yml', 'bbbb2222.yml']);
        // From inside the folder too
        process.chdir(join(dir, 'storymaps'));
        assert.equal((await findProjectFolder({})).projectId, 'proj1234');
    });

    test('a storymap.yml in the current folder means one map, as before projects, and -f always does', async () => {
        const dir = repo('b');
        writeFileSync(join(dir, 'storymaps', 'aaaa1111.yml'), map('Ordering', 'aaaa1111', 'proj1234'));
        writeFileSync(join(dir, 'storymap.yml'), map('Solo', 'cccc3333'));
        assert.equal(await findProjectFolder({}), null);
        assert.equal(await findProjectFolder({ file: 'storymaps/aaaa1111.yml' }), null);
        assert.equal((await findProjectFolder({ dir: 'storymaps' })).projectId, 'proj1234');
    });

    test('a project is pulled into storymaps/, or into the current folder from inside one, never storymaps/storymaps/', async () => {
        const dir = join(root, 'e');
        mkdirSync(dir, { recursive: true });
        process.chdir(dir);
        assert.equal(await defaultProjectDir(), join(dir, 'storymaps'));
        mkdirSync(join(dir, 'storymaps'));
        process.chdir(join(dir, 'storymaps'));
        assert.equal(await defaultProjectDir(), join(dir, 'storymaps'));
        // A folder with another name that already holds project files is a project folder too
        const other = join(root, 'f');
        mkdirSync(other, { recursive: true });
        writeFileSync(join(other, 'aaaa1111.yml'), map('Ordering', 'aaaa1111', 'proj1234'));
        process.chdir(other);
        assert.equal(await defaultProjectDir(), other);
        assert.equal(await defaultProjectDir('elsewhere'), join(other, 'elsewhere'));
    });

    test('when storymap.yml wins, a project in reach is mentioned with its --dir', async () => {
        const dir = repo('g');
        writeFileSync(join(dir, 'storymaps', 'aaaa1111.yml'), map('Ordering', 'aaaa1111', 'proj1234'));
        writeFileSync(join(dir, 'storymap.yml'), map('Solo', 'cccc3333'));
        const logged = [];
        const log = console.log;
        console.log = (line) => logged.push(line);
        try {
            assert.equal(await findProjectFolder({}), null);
        } finally {
            console.log = log;
        }
        assert.match(logged.join('\n'), /Using storymap\.yml\. Add --dir storymaps for the project in storymaps\/\./);
    });

    test('files from two projects stop the command', async () => {
        const dir = repo('c');
        writeFileSync(join(dir, 'storymaps', 'aaaa1111.yml'), map('Ordering', 'aaaa1111', 'proj1234'));
        writeFileSync(join(dir, 'storymaps', 'bbbb2222.yml'), map('Other', 'bbbb2222', 'proj9999'));
        await assert.rejects(findProjectFolder({}), (err) => err instanceof StopError && /2 projects/.test(err.message));
    });

    test('a file that names a project but cannot be read is reported, not skipped', async () => {
        const dir = repo('d');
        writeFileSync(join(dir, 'storymaps', 'aaaa1111.yml'), map('Ordering', 'aaaa1111', 'proj1234'));
        writeFileSync(join(dir, 'storymaps', 'bbbb2222.yml'), `${map('Broken', 'bbbb2222', 'proj1234')}  bad: [unclosed\n`);
        const files = await readProjectFiles(join(dir, 'storymaps'));
        assert.equal(files.length, 2);
        assert.ok(files.find(f => f.name === 'bbbb2222.yml').broken);
        assert.equal((await findProjectFolder({})).projectId, 'proj1234');
    });
});

describe('questions with no terminal', () => {
    // Tests run with no terminal, as scripts and most agent tools do
    test('a question about how much to do takes its default', async () => {
        assert.equal(await choose({ message: 'Pull:', choices: [], defaultValue: 'map' }), 'map');
        assert.equal(await ask({ message: 'Also the maps?', defaultValue: false }), false);
    });

    test('a guard stops and names --force, unless --force was given', async () => {
        await assert.rejects(guard({ message: 'Apply changes?', stopMessage: 'Nothing was written.' }), (err) => err instanceof StopError && /Nothing was written\. Run again with --force/.test(err.message));
        assert.equal(await guard({ message: 'Apply changes?', force: true }), true);
    });

    test('a password comes from STORYMAPS_PASSWORD, or the command stops', async () => {
        const saved = process.env[PASSWORD_ENV];
        try {
            process.env[PASSWORD_ENV] = 'cafe';
            assert.equal(await askPassword(), hashPassword('cafe'));
            assert.equal(await askPassword({ confirmTwice: true }), hashPassword('cafe'));
            await assert.rejects(askPassword({ allowEnv: false, noPasswordMessage: 'Unlock first.' }), /Unlock first\./);
            delete process.env[PASSWORD_ENV];
            await assert.rejects(askPassword(), (err) => err instanceof StopError && /STORYMAPS_PASSWORD/.test(err.message));
        } finally {
            if (saved === undefined) delete process.env[PASSWORD_ENV];
            else process.env[PASSWORD_ENV] = saved;
        }
    });
});

test('lists names the way the messages say them', () => {
    assert.equal(listNames(['CLI']), 'CLI');
    assert.equal(listNames(['CLI', 'MCP Server']), 'CLI and MCP Server');
    assert.equal(listNames(['A', 'B', 'C']), 'A, B and C');
});
