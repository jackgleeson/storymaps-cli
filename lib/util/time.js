// Storymaps CLI — AGPL-3.0 — see LICENCE for details
// Short local times: HH:MM for today, YYYY-MM-DD HH:MM for other days

export function formatTime(ts) {
    const d = new Date(ts);
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;

    if (d.toDateString() === now.toDateString()) return time;
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${time}`;
}
