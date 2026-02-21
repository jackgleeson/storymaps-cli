# Storymaps CLI

The Storymaps CLI turns your storymaps.io map diagrams into YAML files you can version-control in git, diff in pull requests, and sync with the [storymaps.io](https://storymaps.io) server or your self-hosted instance all from your terminal. Built by developers for developers. 

Story maps aren't just cards on a screen, they're structured data. The CLI lets you import the structure behind the diagram, edit it as code, and convert back and forth between your repo and the browser.

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

Or clone and link locally:

```bash
git clone https://github.com/jackgleeson/storymaps-cli.git
cd storymaps-cli
npm install
npm link
```

## Quick Start

```bash
storymaps init                        # create a new storymap.yml
storymaps open                        # view it in the browser
```

Or pull an existing map:

```bash
storymaps pull storymaps.io/abc123    # download as YAML
```

Edit the YAML in your editor, then push it back:

```bash
storymaps diff                        # see what changed
storymaps push                        # upload to the server
```

## Status

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

Non-task cards (notes, questions) are excluded from stats counts based on the legend.

## Commands

### `init`

```bash
storymaps init
storymaps init --site storymaps.yourcompany.com
```

Creates `storymap.yml` and registers it on the server. If you're offline, the file is created locally and `push` will register it later.

### `open`

```bash
storymaps open                        # opens local storymap.yml in the web UI to work with
storymaps open storymaps.io/abc123    # open a specific remote map
```

### `pull`

```bash
storymaps pull                        # uses id/site from storymap.yml
storymaps pull storymaps.io/abc123    # pull a specific map
```

Shows a change summary before overwriting.

### `push`

```bash
storymaps push                       # push local changes to the server
```

If the file has no `id`, a new map is created automatically. Conflicts are detected using ETags - if the remote changed since your last pull, you'll be prompted to pull first. Locked maps prompt for the password.

### `diff`

```bash
storymaps diff                        # summary vs remote
storymaps diff --full                 # line-by-line diff
storymaps diff file1.yml file2.yml    # compare two local files
```

### `status`

Progress overview - slices, status counts, blocked stories.

### `lock` / `unlock`

```bash
storymaps lock
storymaps unlock                      # session unlock
storymaps unlock --remove             # permanently remove the lock
```

### `validate`

```bash
storymaps validate storymap.yml
```

### `convert`

```bash
storymaps convert storymap.yml --to json
storymaps convert storymap.json --to yaml --out storymap.yml
```

### `import`

Import tasks from an external project tracker into a storymap. Currently supports Phabricator.

```bash
storymaps import --from phabricator --tag my-project
storymaps import --from phab --tag my-project --site localhost
storymaps import --from phab --tag my-project --status open,in-progress
```

Epics (tasks tagged with `Epic` in Phabricator) become steps with their subtasks as cards. Standalone tasks are grouped into backlog columns. The map is registered on the server automatically.

On first run you'll be prompted for your Phabricator instance URL and Conduit API token. Credentials are saved to `~/.storymaps/credentials.json`.

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

## Self-Hosting

The CLI works with any storymaps.io instance:

```bash
storymaps init --site storymaps.yourcompany.com
```

See the [main project README](https://github.com/jackgleeson/userstorymaps#self-hosting) for setup instructions.

## Licence

AGPL-3.0 - see [LICENCE](LICENCE) for details.