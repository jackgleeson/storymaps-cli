# Storymaps CLI

Turn your [storymaps.io](https://storymaps.io) diagrams into YAML files you can version-control, diff in pull requests, and sync with the server - all from your terminal.

Story maps are structured data. The CLI lets you export the structure behind the diagram, edit it as code, and push changes back to the browser.

```diff
# What a story map change looks like in a pull request
 slices:
   - name: MVP
     stories:
       Checkout:
         - name: Payment form
           status: done
+        - name: Apple Pay
+          status: planned
+          tags: [payments, mobile]
```

## Install

```bash
npm install -g storymaps
```

Or run it without installing, the way the Build with AI command on storymaps.io does:

```bash
npx storymaps pull storymaps.io/abc123
```

Or clone and link locally:

```bash
git clone https://github.com/jackgleeson/storymaps-cli.git
cd storymaps-cli
npm install
npm link
```

## Use with AI Coding Agents

A story map makes a good specification for an AI coding agent: the YAML lists every step of the journey and the cards under each one, slice by slice. **Build with AI** on storymaps.io writes the command for you:

```bash
npx storymaps pull --force storymaps.io/abc123 && claude "The storymap file @storymap.yml describes a product plan in user story map format. Use it as a structured specification. Your task: build a functional prototype of the features listed in the 'MVP' slice."
```

From there you steer the agent a slice or a feature at a time ("now build search from the V1 slice"). When a feature has been through QA, set its cards to `status: done` in `storymap.yml` and `storymaps push`, so the map shows the progress to everyone else. Pull again before the next round to pick up changes made in the browser.

## Quick Start

```bash
storymaps init                        # create a new storymap.yml
storymaps open                        # open it in the browser
```

Or pull an existing map:

```bash
storymaps pull storymaps.io/abc123    # download as YAML
storymaps pull storymaps.io/p/k8f2m9xq/abc123    # a map inside a project link works too
```

Edit the YAML, then push it back:

```bash
storymaps diff                        # see what changed
storymaps push                        # sync to the server
```

## Status

See the project status in a snapshot: 

```bash
> storymaps status

Mobile Banking
id: 6u0kmy98

Overall Progress
  ████████████░░░░░░░░ 37/62 stories (60%)
  58 points total

Slices
  MVP      ███████████████ 30/30 (100%) | 52pts
  V1       ██████░░░░░░░░░  7/18 (39%)  | 6pts
  V2       ░░░░░░░░░░░░░░░  0/14 (0%)   1 blocked

Status
  ● done: 37  ● in-progress: 8  ● planned: 16
  ● blocked: 1  ○ no status: 0

Blocked
  ● Scan QR code
```

Non-task cards (notes, questions) are excluded from counts based on the legend.

## Commands

### `init`

```bash
storymaps init
storymaps init --site storymaps.yourcompany.com
```

Creates `storymap.yml` and registers it on the server. If you're offline, the file is created locally and `push` will register it later.

### `open`

```bash
storymaps open                        # open local storymap.yml in the browser
storymaps open storymaps.io/abc123    # open a specific remote map
```

### `pull`

```bash
storymaps pull                        # uses id/site from storymap.yml
storymaps pull storymaps.io/abc123    # pull a specific map
storymaps pull --force                # overwrite the local file without asking
```

Shows a summary of changes and asks before overwriting the local file, unless you pass `--force`.

### `push`

```bash
storymaps push                        # push local changes to the server
storymaps push --force                # skip the conflict check and overwrite the server copy
```

If the file has no `id`, a new map is created on the server. Conflicts are detected using ETags. If the remote has changed since your last pull, you'll be prompted to pull first; `--force` pushes anyway and replaces whatever changed on the server. Locked maps prompt for the password.

### `diff`

```bash
storymaps diff                        # summary of changes vs remote
storymaps diff --full                 # full line-by-line diff
storymaps diff file1.yml file2.yml    # compare two local files
```

### `status`

```bash
storymaps status                      # progress overview of storymap.yml
storymaps status other.yml            # progress overview of a specific file
storymaps status storymaps.io/abc123  # progress overview of a map on the server, no file needed
```

Progress overview: slices, status counts, and blocked stories. A link to a map inside a project works too.

### `log`

```bash
storymaps log                         # activity log for storymap.yml
storymaps log storymaps.io/abc123     # activity log for a specific map
```

Shows timestamped activity entries with source labels (cli, mobile, web).

### `lock` / `unlock`

```bash
storymaps lock                        # lock the map with a password
storymaps unlock                      # session unlock
storymaps unlock --remove             # permanently remove the lock
```

### `backup`

Backs up the map on the server. Add a note to tell the backup apart later.

```bash
storymaps backup                             # back up the map in storymap.yml
storymaps backup -m "Before the workshop"    # with a note
storymaps backup storymaps.io/abc123         # back up a map you haven't pulled
```

The backup shows in the map's activity log, and in **Menu → Backups** in the app.

### `backups`

Lists a map's backups, newest first, with the ID you need to restore one.

```bash
> storymaps backups

6e40f124ae7e  13:25  63 cards   Before the workshop
998e16f31f84  11:02  58 cards   (no note)
```

### `restore`

Puts the map back the way it was in one of its backups. Give it the backup ID from `storymaps backups`.

```bash
storymaps restore 6e40f124ae7e               # asks before it restores
storymaps restore 6e40f124ae7e --force       # restores without asking
```

- **It backs up first.** Before restoring, the CLI backs up the map as it is now, so a restore can be undone with another restore.
- **It changes the server, not your file.** Run `storymaps pull` afterwards to get the restored map. Until you do, `storymaps push` stops with a conflict, so an old local file can't undo the restore by accident.
- **Locked maps** use the password saved by `storymaps unlock`, or ask for it.

### About backups

- The CLI and the app share the same backups. A backup made in the app shows in `storymaps backups`, and one made with the CLI shows in the app.
- The server keeps the newest 8 backups of each map.
- A self-hosted server needs updating before the CLI can make backups on it. An older one turns the request away, and the CLI says so.

### `validate`

```bash
storymaps validate storymap.yml       # check YAML structure
```

### Options

A target can be a map ID, `domain/id`, or a full URL, including a map inside a project link (`storymaps.io/p/<project>/<map>`).

`pull`, `push`, `open`, `lock`, `unlock`, `status`, `log`, `backup`, `backups` and `restore` take `-f, --file <path>` to use a file other than `storymap.yml`.

### `convert`

```bash
storymaps convert storymap.yml --to json                    # YAML to JSON
storymaps convert storymap.json --to yaml --out storymap.yml # JSON to YAML
```


## YAML Format

```yaml
name: Mobile Banking
id: 6u0kmy98
site: storymaps.io

steps:
  - Find App
  - Log In
  - Start Transfer
  - Select Recipient
  - Enter Amount
  - Review
  - Confirm
  - Done

users:
  - name: Bank Customer
    step: Find App

activities:
  - name: Send Money
    step: Find App

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
  - name: MVP
    stories:
      Find App:
        - name: App store listing with screenshots
          status: done
          points: 2
          tags: [ux]
      Log In:
        - name: Email and password login
          status: done
          points: 3
          tags: [security, auth]
        - name: Account locked after failed attempts
          color: "#fecdd3"
      Select Recipient:
        - name: Search contacts
          status: done
          points: 2
          tags: [ux]
        - name: Recent recipients
          status: done
          points: 2
          tags: [ux]
      Confirm:
        - name: Confirm button
          status: done
          points: 1
          tags: [ux]
        - name: SMS one-time code
          status: done
          points: 3
          tags: [security, auth]
          url: https://en.wikipedia.org/wiki/Payment_Services_Directive

  - name: V1
    stories:
      Log In:
        - name: Biometric login
          status: done
          points: 3
          tags: [security, auth]
        - name: Remember device
          status: done
          points: 2
          tags: [security]
      Select Recipient:
        - name: Add new recipient
          status: done
          points: 3
          tags: [payments]
        - name: Mark as favorite
          status: in-progress
          tags: [ux]
```

Cards support: `name`, `body`, `color`, `status` (done / in-progress / planned / blocked), `points`, `tags`, and `url`.

Slices support: `name`, `stories`, `goal` (up to 200 characters), `targetDate` (`YYYY-MM-DD`), and `collapsed` with `closedReason` (complete / closed).

## Self-Hosting

The CLI works with any storymaps.io instance:

```bash
storymaps init --site storymaps.yourcompany.com
```

See the [main project README](https://github.com/jackgleeson/storymaps.io#self-hosting) for setup instructions.

Every request names the CLI and its version in the User-Agent header (`storymaps-cli/<version>`), so CLI use shows up as such in your server logs.

## Development

```bash
npm install
npm test
```

`npm test` runs the unit tests in `test/unit` with Node's built-in test runner (Node 22 or later). They cover the YAML format, the API client, the change summary, and how a target resolves to a map, with no server needed. CI runs them on Node 22 and 24 for every push to `main` and every pull request.

To try a change against a local storymaps.io server, run the CLI from the repo, for example `node bin/storymaps.js pull localhost/<map-id>`.

### Releasing

1. Commit your changes on `main`.
2. Bump the version in `package.json` and in both places near the top of `package-lock.json`, and commit it as "Bump version to x.y.z". Use a patch for fixes and a minor version for new features.
3. Tag the commit and push both:
   ```bash
   git tag vx.y.z
   git push origin main vx.y.z
   ```
4. Check you're logged in to npm, then publish:
   ```bash
   npm whoami        # if this fails, run npm login
   npm pack --dry-run   # optional: list what will be published
   npm publish
   ```
5. Confirm the new version is live with `npm view storymaps version`.

Only `bin/`, `lib/`, the README and the licence are published (see `files` in `package.json`).

## Licence

AGPL-3.0 - see [LICENCE](LICENCE) for details.
