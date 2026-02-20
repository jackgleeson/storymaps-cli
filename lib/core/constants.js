// Storymaps.io — AGPL-3.0 — see LICENCE for details
// Constants and pure utility functions

import { randomBytes } from 'node:crypto';

// Generate cryptographically secure 8-char ID
// 6 random bytes → BigInt → base36 string (0-9, a-z) → last 8 chars
export const generateId = () => {
    const bytes = randomBytes(6);
    const num = Array.from(bytes).reduce((acc, b) => acc * 256n + BigInt(b), 0n);
    return num.toString(36).slice(-8).padStart(8, '0');
};

export const isValidUrl = (url) => {
    if (!url) return false;
    try {
        const parsed = new URL(url);
        return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
        return false;
    }
};

export const CARD_COLORS = {
    red: '#fca5a5',
    rose: '#fecdd3',
    orange: '#fdba74',
    amber: '#fcd34d',
    yellow: '#fef08a',
    lime: '#bef264',
    green: '#86efac',
    teal: '#5eead4',
    cyan: '#a5f3fc',
    blue: '#93c5fd',
    indigo: '#a5b4fc',
    purple: '#d8b4fe',
    fuchsia: '#f0abfc',
    pink: '#f9a8d4'
};

// Default colors for card types (references CARD_COLORS values)
export const DEFAULT_CARD_COLORS = {
    Users: '#fca5a5',       // red
    Activities: '#93c5fd',  // blue
    story: '#fef08a'        // yellow
};

export const STATUS_OPTIONS = {
    done: { label: 'Done', color: '#22c55e' },
    'in-progress': { label: 'In Progress', color: '#eab308' },
    planned: { label: 'Planned', color: '#3b82f6' },
    blocked: { label: 'Blocked', color: '#ef4444' }
};
