# storymaps-cli

CLI companion for [storymaps.io](https://storymaps.io) — manage user story maps from the terminal.

## Install

```bash
npm install
```

## Usage

```bash
storymaps <command>
```

### `init`

Create a new `storymap.yml` in the current directory:

```bash
storymaps init
```

### `validate`

Validate a storymap YAML or JSON file:

```bash
storymaps validate storymap.yml
```

Exits with code 0 if valid, 1 if there are errors.

## Licence

AGPL-3.0 — see [LICENCE](LICENCE) for details.
