// Storymaps CLI — AGPL-3.0 — see LICENCE for details
// Questions, and the passwords for locked maps and projects
//
// A question is only asked when the CLI runs in a terminal. Run from a script, CI or most agent
// tools there's no terminal, so:
//   - a question that only picks how much to do takes its default, and the command says so
//   - a question that guards against overwriting or removing something stops, naming --force
// -y, --yes takes the defaults in a terminal too, for agent tools that do run in one.
// Passwords are never flags. They're typed, remembered after an unlock, or taken from the
// STORYMAPS_PASSWORD environment variable, for scripts and CI.

import { createHash } from 'node:crypto';
import { confirm, password, select } from '@inquirer/prompts';

const THEME = { prefix: '>' };

export const PASSWORD_ENV = 'STORYMAPS_PASSWORD';

export const isInteractive = () => !!(process.stdin.isTTY && process.stdout.isTTY);

export const hashPassword = (pw) => createHash('sha256').update(pw).digest('hex');

// The password from STORYMAPS_PASSWORD, hashed, or null when it isn't set
export const envPasswordHash = () => {
    const pw = process.env[PASSWORD_ENV];
    return pw ? hashPassword(pw) : null;
};

// Stops a command with a message, without the "Error:" a crash would print
export class StopError extends Error {
    constructor(message) {
        super(message);
        this.name = 'StopError';
    }
}

// A question about how much to do. Returns the default with --yes or no terminal.
export async function choose({ message, choices, defaultValue, yes }) {
    if (yes || !isInteractive()) return defaultValue;
    return select({ message, choices, default: defaultValue, theme: THEME });
}

// A yes or no question about how much to do, with the same rules as choose
export async function ask({ message, defaultValue = false, yes }) {
    if (yes || !isInteractive()) return defaultValue;
    return confirm({ message, default: defaultValue, theme: THEME });
}

// A question that guards against overwriting or removing something. --force answers yes; with
// no terminal and no --force, the command stops and says to use it.
export async function guard({ message, force, stopMessage }) {
    if (force) return true;
    if (!isInteractive()) throw new StopError(`${stopMessage || 'Nothing was changed.'} Run again with --force to go ahead without being asked.`);
    return confirm({ message, default: true, theme: THEME });
}

// A password, hashed: from STORYMAPS_PASSWORD when allowed and set, or typed in a terminal.
// confirmTwice asks again, for setting a new password. Throws a StopError when neither is possible.
// A new password, set with confirmTwice, needs at least 4 characters, the same as in the app
const MIN_PASSWORD_LENGTH = 4;
const tooShort = () => new StopError(`Use a password of at least ${MIN_PASSWORD_LENGTH} characters, the same as in the app.`);

export async function askPassword({ allowEnv = true, confirmTwice = false, noPasswordMessage } = {}) {
    if (allowEnv && process.env[PASSWORD_ENV]) {
        if (confirmTwice && process.env[PASSWORD_ENV].length < MIN_PASSWORD_LENGTH) throw tooShort();
        return envPasswordHash();
    }
    if (!isInteractive()) {
        throw new StopError(noPasswordMessage || `This needs a password, and there's no terminal to type it in. Set ${PASSWORD_ENV} for this command.`);
    }
    const pw = await password({ message: 'Password:', theme: THEME });
    if (confirmTwice && pw.length < MIN_PASSWORD_LENGTH) throw tooShort();
    if (confirmTwice) {
        const again = await password({ message: 'Confirm password:', theme: THEME });
        if (pw !== again) throw new StopError('Passwords do not match.');
    }
    return hashPassword(pw);
}
