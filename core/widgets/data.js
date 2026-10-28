// SPDX-License-Identifier: GPL-3.0-or-later
// Pure data shaping for the built-in widgets: what each provider's raw input turns into.
// No gi:// imports; tested by tests/widgetsData.test.js.

// ---- clock -------------------------------------------------------------------------------

/** Hand angles in degrees (12 o'clock = 0, clockwise) for an analog face. */
export function handAngles(hours, minutes) {
    return {
        hour: ((hours % 12) + minutes / 60) * 30,
        minute: minutes * 6,
    };
}

/** Milliseconds until the next whole minute, so a clock ticks on the minute (at least 1 s). */
export function msToNextMinute(seconds, ms = 0) {
    return Math.max(1000, (60 - seconds) * 1000 - ms);
}

/**
 * The difference of a world clock to local time, as "+3h", "−1h 30m" or "Same time".
 *
 * @param {number} offsetSeconds the other zone's UTC offset minus the local one
 * @param {(s: string) => string} _ gettext
 */
export function offsetLabel(offsetSeconds, _ = s => s) {
    if (offsetSeconds === 0)
        return _('Same time');
    const sign = offsetSeconds > 0 ? '+' : '−';
    const total = Math.abs(Math.round(offsetSeconds / 60));
    const h = Math.floor(total / 60);
    const m = total % 60;
    return m ? `${sign}${h}h ${m}m` : `${sign}${h}h`;
}

/** The city a time-zone identifier names: "Europe/Riga" is "Riga", "America/New_York" "New York". */
export function cityFromTimezone(identifier) {
    const last = String(identifier ?? '').split('/').pop().replace(/_/g, ' ');
    return last && last !== 'UTC' ? last : '';
}

/**
 * The line under a world clock: the day and the hours it is ahead of or behind local time,
 * "Today, +3h", "Tomorrow, +13h", "Yesterday, −5h".
 *
 * @param {number} dayDelta calendar days the other zone is ahead (-1, 0 or 1)
 * @param {number} offsetSeconds the other zone's UTC offset minus the local one
 */
export function worldLabel(dayDelta, offsetSeconds, _ = s => s) {
    const day = dayDelta > 0 ? _('Tomorrow') : dayDelta < 0 ? _('Yesterday') : _('Today');
    return `${day}, ${offsetLabel(offsetSeconds, _)}`;
}

// ---- calendar ----------------------------------------------------------------------------

/**
 * The events still to come today and in the next days, soonest first, all-day events of a
 * day before its timed ones.
 *
 * @param {Array<{id: string, summary: string, date: Date, end: Date}>} events
 * @param {Date} now
 * @param {number} limit
 * @returns {Array<{id: string, summary: string, date: Date, end: Date, allDay: boolean, today: boolean}>}
 */
export function upcomingEvents(events, now, limit) {
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(dayStart.getTime() + 86400000);
    const out = [];
    for (const e of events ?? []) {
        if (!(e?.date instanceof Date) || !(e.end instanceof Date) || e.end <= now)
            continue;
        const len = e.end - e.date;
        const allDay = len >= 86400000 && e.date.getHours() === 0 && e.date.getMinutes() === 0;
        out.push({
            id: e.id, summary: e.summary || '', date: e.date, end: e.end, allDay,
            today: e.date < tomorrow,
        });
    }
    out.sort((a, b) => {
        const da = a.allDay && a.date < dayStart ? dayStart : a.date;
        const db = b.allDay && b.date < dayStart ? dayStart : b.date;
        const dayA = Math.floor((da - dayStart) / 86400000);
        const dayB = Math.floor((db - dayStart) / 86400000);
        if (dayA !== dayB)
            return dayA - dayB;
        if (a.allDay !== b.allDay)
            return a.allDay ? -1 : 1;
        return a.date - b.date;
    });
    return out.slice(0, limit);
}

/**
 * The days of a month grid (weeks of 7), starting on `weekStart` (0 = Sunday).
 *
 * @returns {Array<Array<{day: number, inMonth: boolean, today: boolean}>>}
 */
export function monthGrid(year, month, today, weekStart = 1) {
    const first = new Date(year, month, 1);
    const lead = (first.getDay() - weekStart + 7) % 7;
    const days = new Date(year, month + 1, 0).getDate();
    const weeks = [];
    let week = [];
    for (let i = -lead; weeks.length < 6; i++) {
        const d = new Date(year, month, 1 + i);
        week.push({
            day: d.getDate(),
            inMonth: i >= 0 && i < days,
            today: d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() &&
                d.getDate() === today.getDate(),
        });
        if (week.length === 7) {
            weeks.push(week);
            week = [];
            if (i + 1 >= days)
                break;
        }
    }
    return weeks;
}

// ---- weather -----------------------------------------------------------------------------

/**
 * "H:21° L:12°" from the forecast's temperature texts ("21°C", "54 °F"), or '' with fewer than two
 * numbers to compare.
 *
 * @param {Array<{temp: string}>} forecasts
 */
export function highLow(forecasts) {
    const values = (forecasts ?? []).map(f => /-?\d+/.exec(f.temp ?? '')?.[0]).filter(Boolean).map(Number);
    if (values.length < 2)
        return '';
    return `H:${Math.max(...values)}° L:${Math.min(...values)}°`;
}

// ---- batteries ---------------------------------------------------------------------------

// UPower.DeviceKind and DeviceState values (org.freedesktop.UPower.Device Type / State)
const KIND_LINE_POWER = 1;
const KIND_BATTERY = 2;
const ICONS = {
    2: 'computer-symbolic', 3: 'uninterruptible-power-supply-symbolic', 5: 'input-mouse-symbolic',
    6: 'input-keyboard-symbolic', 8: 'phone-symbolic', 9: 'multimedia-player-symbolic',
    10: 'computer-apple-ipad-symbolic', 12: 'input-gaming-symbolic', 13: 'input-tablet-symbolic',
    14: 'input-touchpad-symbolic', 17: 'audio-headset-symbolic', 18: 'audio-speakers-symbolic',
    19: 'audio-headphones-symbolic', 26: 'watch-symbolic',
};
export const STATE_CHARGING = 1;
export const STATE_FULL = 4;

/**
 * The devices the Batteries widget lists: the laptop's own battery first, then every other
 * device with a charge (mice, keyboards, headsets, phones), by name. Line power, absent
 * batteries and devices without a percentage are left out.
 *
 * @param {Array<{path: string, type: number, percentage: number, state: number, model: string,
 *   powerSupply: boolean, isPresent: boolean}>} devices
 * @returns {Array<{path: string, name: string, percent: number, charging: boolean, icon: string, internal: boolean}>}
 */
export function batteryList(devices, _ = s => s) {
    const out = [];
    for (const d of devices ?? []) {
        if (!d || d.type === KIND_LINE_POWER || !Number.isFinite(d.percentage))
            continue;
        if (d.type === KIND_BATTERY && d.isPresent === false)
            continue;
        const internal = d.type === KIND_BATTERY && d.powerSupply !== false;
        out.push({
            path: d.path,
            name: internal ? _('This Computer') : d.model || _('Device'),
            percent: Math.round(Math.min(100, Math.max(0, d.percentage))),
            charging: d.state === STATE_CHARGING || d.state === STATE_FULL,
            icon: ICONS[d.type] ?? 'battery-symbolic',
            internal,
        });
    }
    out.sort((a, b) => (a.internal !== b.internal ? (a.internal ? -1 : 1) : a.name.localeCompare(b.name)));
    return out;
}

/** The fill level of a battery ring: a colour class by charge. */
export function batteryLevel(percent, charging) {
    if (charging)
        return 'charging';
    if (percent <= 10)
        return 'critical';
    if (percent <= 20)
        return 'low';
    return 'normal';
}

// ---- system ------------------------------------------------------------------------------

/** The cpu line of /proc/stat as {idle, total} jiffies, or null. */
export function parseCpu(stat) {
    const line = (stat ?? '').split('\n').find(l => l.startsWith('cpu '));
    if (!line)
        return null;
    const v = line.trim().split(/\s+/).slice(1).map(Number);
    if (v.length < 4 || v.some(n => !Number.isFinite(n)))
        return null;
    const idle = v[3] + (v[4] ?? 0);
    const total = v.reduce((a, b) => a + b, 0);
    return { idle, total };
}

/** CPU use between two samples, 0..1. */
export function cpuUsage(prev, next) {
    if (!prev || !next || next.total <= prev.total)
        return 0;
    const busy = (next.total - prev.total) - (next.idle - prev.idle);
    return Math.min(1, Math.max(0, busy / (next.total - prev.total)));
}

/** Memory from /proc/meminfo: {used, total} in bytes, or null. */
export function parseMemory(meminfo) {
    const get = key => {
        const m = new RegExp(`^${key}:\\s+(\\d+)`, 'm').exec(meminfo ?? '');
        return m ? Number(m[1]) * 1024 : null;
    };
    const total = get('MemTotal');
    const avail = get('MemAvailable');
    if (!total || avail === null)
        return null;
    return { used: total - avail, total };
}

/** "3.2 GB" style size. */
export function formatBytes(bytes) {
    const gb = bytes / 1024 ** 3;
    return gb >= 10 ? `${Math.round(gb)} GB` : `${gb.toFixed(1)} GB`;
}

// ---- media -------------------------------------------------------------------------------

/**
 * What the Now Playing widget shows for a player (or null for none).
 *
 * @param {?{trackTitle: string, trackArtists: string[], trackCoverUrl: string, status: string,
 *   canGoNext: boolean, canGoPrevious: boolean, appName: string}} p
 */
export function mediaState(p) {
    if (!p)
        return { playing: false, title: '', artist: '', art: '', canNext: false, canPrev: false, app: '', has: false };
    return {
        has: true,
        playing: p.status === 'Playing',
        title: p.trackTitle || '',
        artist: (p.trackArtists ?? []).filter(Boolean).join(', '),
        art: p.trackCoverUrl || '',
        canNext: !!p.canGoNext,
        canPrev: !!p.canGoPrevious,
        app: p.appName || '',
    };
}

// ---- world clock -------------------------------------------------------------------------

const N_ = s => s;

/**
 * The cities World Clock shows while GNOME Clocks has none: macOS's own first four, then two
 * more for the large size. Names are translatable (N_), zones are IANA identifiers.
 */
export const DEFAULT_WORLD_CLOCKS = Object.freeze([
    { name: N_('Cupertino'), tz: 'America/Los_Angeles' },
    { name: N_('Tokyo'), tz: 'Asia/Tokyo' },
    { name: N_('Sydney'), tz: 'Australia/Sydney' },
    { name: N_('Paris'), tz: 'Europe/Paris' },
    { name: N_('New York'), tz: 'America/New_York' },
    { name: N_('London'), tz: 'Europe/London' },
]);

/** The default cities without the one the computer is in (it is shown first as local time). */
export function fallbackClocks(localZone, list = DEFAULT_WORLD_CLOCKS) {
    return list.filter(c => c.tz !== localZone);
}

// ---- calendar: Up Next and the day list ---------------------------------------------------

/**
 * The coming events grouped by day, for the Up Next list: [{day, date, events}] where `day` is
 * 0 for today, 1 for tomorrow and so on (an all-day event that began earlier counts as today).
 */
export function agenda(events, now, limit) {
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const groups = [];
    for (const e of upcomingEvents(events, now, limit)) {
        const start = e.date < dayStart ? dayStart : e.date;
        const d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
        const day = Math.round((d - dayStart) / 86400000);
        let g = groups[groups.length - 1];
        if (!g || g.day !== day) {
            g = { day, date: d, events: [] };
            groups.push(g);
        }
        g.events.push(e);
    }
    return groups;
}

/** The event Up Next leads with: the first timed one still to come or under way, else the first. */
export function nextEvent(events, now) {
    const list = upcomingEvents(events, now, 50);
    return list.find(e => !e.allDay) ?? list[0] ?? null;
}

/** "Now", "In 25 min", "In 2 h", or '' a day or more away. */
export function startsIn(date, now, _ = s => s) {
    const min = Math.round((date - now) / 60000);
    if (min <= 0)
        return _('Now');
    if (min < 60)
        return _('In %d min').replace('%d', String(min));
    if (min < 24 * 60)
        return _('In %d h').replace('%d', String(Math.round(min / 60)));
    return '';
}

// ---- reminders (Evolution Data Server task lists, as iCalendar VTODO) ----------------------

/** iCalendar line unfolding: a line break followed by a space or a tab joins the lines. */
export function unfoldIcs(text) {
    return String(text ?? '').replace(/\r?\n[ \t]/g, '');
}

function unescapeText(v) {
    return v.replace(/\\([nN,;\\])/g, (_m, c) => (c === 'n' || c === 'N' ? '\n' : c));
}

// "20261028" (a date) or "20261028T150000[Z]" (a time; without Z it is read as local time)
function icsDate(value, params) {
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim());
    if (!m)
        return null;
    const [, y, mo, d, h, mi, s, z] = m;
    if (h === undefined || /VALUE=DATE(?!-)/i.test(params))
        return { date: new Date(+y, +mo - 1, +d), allDay: true };
    const date = z ? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)) : new Date(+y, +mo - 1, +d, +h, +mi, +s);
    return { date, allDay: false };
}

// The properties of the first VTODO of an iCalendar text (nested VALARMs skipped), or null
function todoProps(ics) {
    const props = new Map();
    let depth = 0;
    let inTodo = false;
    for (const line of unfoldIcs(ics).split(/\r?\n/)) {
        const m = /^([A-Za-z0-9-]+)((?:;[^:]*)?):(.*)$/.exec(line);
        if (!m)
            continue;
        const name = m[1].toUpperCase();
        if (name === 'BEGIN') {
            if (m[3].trim().toUpperCase() === 'VTODO' && !inTodo) {
                inTodo = true;
                depth = 0;
            } else if (inTodo) {
                depth++;
            }
            continue;
        }
        if (name === 'END') {
            if (!inTodo)
                continue;
            if (depth === 0)
                return props;
            depth--;
            continue;
        }
        if (inTodo && depth === 0 && !props.has(name))
            props.set(name, { params: m[2], value: m[3] });
    }
    return inTodo ? props : null;
}

/**
 * One reminder from an EDS object (a VTODO, alone or in a VCALENDAR), or null.
 *
 * @returns {?{uid: string, summary: string, due: ?Date, allDay: boolean, priority: number,
 *   completed: boolean, recurring: boolean}}
 */
export function parseTodo(ics) {
    const p = todoProps(ics);
    if (!p || !p.get('UID')?.value)
        return null;
    const due = p.has('DUE') ? icsDate(p.get('DUE').value, p.get('DUE').params) : null;
    const status = (p.get('STATUS')?.value ?? '').trim().toUpperCase();
    const priority = Number.parseInt(p.get('PRIORITY')?.value ?? '0', 10);
    return {
        uid: p.get('UID').value.trim(),
        summary: unescapeText(p.get('SUMMARY')?.value ?? '').trim(),
        due: due?.date ?? null,
        allDay: due?.allDay ?? false,
        priority: Number.isFinite(priority) && priority > 0 && priority <= 9 ? priority : 0,
        completed: status === 'COMPLETED' || status === 'CANCELLED' || p.has('COMPLETED'),
        recurring: p.has('RRULE') || p.has('RECURRENCE-ID'),
    };
}

/**
 * The open reminders in macOS's order: those with a due date first (soonest first, overdue
 * at the top), then by priority (1 is the highest, none comes last), then by name.
 */
export function sortReminders(list) {
    const rank = r => (r.priority === 0 ? 10 : r.priority);
    return list.filter(r => r && !r.completed).sort((a, b) => {
        if (!!a.due !== !!b.due)
            return a.due ? -1 : 1;
        if (a.due && b.due && a.due - b.due !== 0)
            return a.due - b.due;
        if (rank(a) !== rank(b))
            return rank(a) - rank(b);
        return a.summary.localeCompare(b.summary);
    });
}

/** A UTC iCalendar time: 20261028T153000Z. */
export function icsUtc(date) {
    const p = (n, w = 2) => String(n).padStart(w, '0');
    return `${p(date.getUTCFullYear(), 4)}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}T` +
        `${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`;
}

/**
 * The same VTODO marked done, as Endeavour writes it: STATUS:COMPLETED, PERCENT-COMPLETE:100,
 * COMPLETED and LAST-MODIFIED now. Everything else, nested alarms included, stays as it was.
 */
export function completeTodo(ics, now) {
    const out = [];
    const drop = new Set(['STATUS', 'PERCENT-COMPLETE', 'COMPLETED', 'LAST-MODIFIED']);
    let inTodo = false;
    let depth = 0;
    let done = false;
    for (const line of unfoldIcs(ics).split(/\r?\n/)) {
        const name = (/^([A-Za-z0-9-]+)[;:]/.exec(line)?.[1] ?? '').toUpperCase();
        const value = line.slice(line.indexOf(':') + 1).trim().toUpperCase();
        if (name === 'BEGIN' && value === 'VTODO' && !inTodo && !done) {
            inTodo = true;
            depth = 0;
        } else if (inTodo && name === 'BEGIN') {
            depth++;
        } else if (inTodo && name === 'END') {
            if (depth === 0) {
                const stamp = icsUtc(now);
                out.push('STATUS:COMPLETED', 'PERCENT-COMPLETE:100', `COMPLETED:${stamp}`, `LAST-MODIFIED:${stamp}`);
                inTodo = false;
                done = true;
            } else {
                depth--;
            }
        } else if (inTodo && depth === 0 && drop.has(name)) {
            continue;
        }
        out.push(line);
    }
    while (out.length && out[out.length - 1] === '')
        out.pop();
    return out.join('\r\n');
}

/**
 * A task list from an EDS source's key file (org.gnome.evolution.dataserver.Source Data):
 * {name, enabled, color} when the source has a [Task List] group, else null.
 */
export function taskListOf(data) {
    const groups = new Map();
    let group = null;
    for (const raw of String(data ?? '').split('\n')) {
        const line = raw.trim();
        const g = /^\[(.+)\]$/.exec(line);
        if (g) {
            group = new Map();
            groups.set(g[1], group);
        } else if (group && line && !line.startsWith('#')) {
            const i = line.indexOf('=');
            if (i > 0)
                group.set(line.slice(0, i).trim(), line.slice(i + 1).trim());
        }
    }
    const list = groups.get('Task List');
    if (!list)
        return null;
    const source = groups.get('Data Source') ?? new Map();
    return {
        name: source.get('DisplayName') ?? '',
        enabled: source.get('Enabled') !== 'false',
        color: list.get('Color') ?? '',
    };
}

// ---- notes -------------------------------------------------------------------------------

export const NOTE_MAX = 10000;

/** The notes Kiwi keeps (the widgets-notes key): {id: text}. Malformed text is no notes. */
export function parseNotes(text) {
    try {
        const data = JSON.parse(text || '{}');
        const out = {};
        for (const [id, v] of Object.entries(data?.notes ?? {})) {
            if (typeof v === 'string')
                out[id] = v.slice(0, NOTE_MAX);
        }
        return out;
    } catch (_e) {
        return {};
    }
}

/** The key's text with one note changed; an empty note is dropped, no notes is ''. */
export function serializeNotes(notes, id, text) {
    const next = { ...notes };
    const t = String(text ?? '').slice(0, NOTE_MAX);
    if (t.trim())
        next[id] = t;
    else
        delete next[id];
    return Object.keys(next).length ? JSON.stringify({ notes: next }) : '';
}

// ---- photos ------------------------------------------------------------------------------

const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heif', 'image/avif', 'image/tiff']);
// Not "featured": screenshots, wallpapers, hidden folders and thumbnail caches
const SKIP_DIRS = new Set(['screenshots', 'screencasts', 'wallpapers', 'thumbnails']);

/** Does a file of this content type belong in Photos? */
export const isPhotoType = type => PHOTO_TYPES.has(String(type ?? '').toLowerCase());

/** Does Photos look into this folder? */
export const isPhotoDir = name => !!name && !name.startsWith('.') && !SKIP_DIRS.has(name.toLowerCase());

/**
 * The photo of a time slot: the same one for the whole slot (so every view agrees and a
 * restart keeps it), another one in the next. `shuffle` moves on (Next Photo).
 */
export function pickPhoto(count, slot, shuffle = 0) {
    if (count <= 0)
        return -1;
    // Knuth's multiplicative hash, so neighbouring slots land far apart
    const h = Math.imul((slot + shuffle * 7919) | 0, 2654435761 | 0) >>> 0;
    return h % count;
}

/** The time slot of a shuffle interval ('hourly' or 'daily'), in local time. */
export function photoSlot(now, interval) {
    const ms = now.getTime() - now.getTimezoneOffset() * 60000;
    return Math.floor(ms / (interval === 'daily' ? 86400000 : 3600000));
}

// ---- recent files (~/.local/share/recently-used.xbel, read only) ---------------------------

const XML_ENTITIES = { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' };
const decodeXml = s => s.replace(/&(lt|gt|quot|apos|amp|#(\d+)|#x([0-9a-fA-F]+));/g, (_m, n, d, x) =>
    XML_ENTITIES[n] ?? String.fromCodePoint(d ? Number(d) : parseInt(x, 16)));

function attrs(tag) {
    const out = {};
    for (const m of tag.matchAll(/([A-Za-z_:][-\w:.]*)\s*=\s*("([^"]*)"|'([^']*)')/g))
        out[m[1]] = decodeXml(m[3] ?? m[4] ?? '');
    return out;
}

/**
 * The bookmarks of a recently-used.xbel text: [{uri, time, mime}], time the latest of added,
 * modified and visited (ms). Malformed entries are skipped.
 */
export function parseRecent(xml) {
    const out = [];
    for (const m of String(xml ?? '').matchAll(/<bookmark\s([^>]*)>([\s\S]*?)<\/bookmark>/g)) {
        const a = attrs(m[1]);
        if (!a.href)
            continue;
        const times = [a.added, a.modified, a.visited].map(t => Date.parse(t ?? '')).filter(Number.isFinite);
        const mime = /<mime:mime-type\s([^>]*?)\/?>/.exec(m[2]);
        out.push({ uri: a.href, time: times.length ? Math.max(...times) : 0, mime: mime ? attrs(mime[1]).type ?? '' : '' });
    }
    return out;
}

/** The file name a URI ends in, decoded. */
export function uriName(uri) {
    const last = String(uri ?? '').replace(/\/+$/, '').split('/').pop() ?? '';
    try {
        return decodeURIComponent(last);
    } catch (_e) {
        return last;
    }
}

/** Local files only, newest first, each once, with their names. */
export function recentFiles(items, limit) {
    const seen = new Set();
    const out = [];
    const sorted = (items ?? []).filter(i => typeof i?.uri === 'string' && i.uri.startsWith('file:///'))
        .sort((a, b) => b.time - a.time);
    for (const i of sorted) {
        if (seen.has(i.uri))
            continue;
        seen.add(i.uri);
        out.push({ ...i, name: uriName(i.uri) });
        if (out.length === limit)
            break;
    }
    return out;
}

/** "Just now", "5 min ago", "3 h ago", "Yesterday", or '' when older (show the date). */
export function timeAgo(time, now, _ = s => s) {
    const min = Math.floor((now - time) / 60000);
    if (min < 1)
        return _('Just now');
    if (min < 60)
        return _('%d min ago').replace('%d', String(min));
    const day = d => new Date(d).setHours(0, 0, 0, 0);
    if (day(now) === day(time))
        return _('%d h ago').replace('%d', String(Math.floor(min / 60)));
    return day(now) - day(time) <= 86400000 * 1.1 ? _('Yesterday') : '';
}

// ---- system: disk and network ------------------------------------------------------------

/** Received and sent bytes over every interface but loopback, from /proc/net/dev, or null. */
export function parseNetDev(text) {
    let rx = 0;
    let tx = 0;
    let any = false;
    for (const line of String(text ?? '').split('\n')) {
        const m = /^\s*([^:\s]+):\s*(.*)$/.exec(line);
        if (!m || m[1] === 'lo')
            continue;
        const v = m[2].trim().split(/\s+/).map(Number);
        if (v.length < 9 || !Number.isFinite(v[0]) || !Number.isFinite(v[8]))
            continue;
        rx += v[0];
        tx += v[8];
        any = true;
    }
    return any ? { rx, tx } : null;
}

/** Bytes per second between two samples `seconds` apart (a counter reset reads as 0). */
export function netRate(prev, next, seconds) {
    if (!prev || !next || seconds <= 0)
        return { rx: 0, tx: 0 };
    return {
        rx: Math.max(0, (next.rx - prev.rx) / seconds),
        tx: Math.max(0, (next.tx - prev.tx) / seconds),
    };
}

/** "820 B/s", "12 KB/s", "3.4 MB/s". */
export function formatRate(bps) {
    if (bps < 1000)
        return `${Math.round(bps)} B/s`;
    if (bps < 1e6)
        return `${Math.round(bps / 1e3)} KB/s`;
    const mb = bps / 1e6;
    return mb >= 10 ? `${Math.round(mb)} MB/s` : `${mb.toFixed(1)} MB/s`;
}

/** A network rate as 0..1 for a ring or a graph: log scale from 1 KB/s to 100 MB/s. */
export function rateLevel(bps) {
    if (bps <= 1000)
        return 0;
    return Math.min(1, Math.log10(bps / 1000) / 5);
}

// ---- timers ------------------------------------------------------------------------------

/** "4:05", "1:02:03": a countdown, rounded up so it never shows 0:00 while it runs. */
export function formatCountdown(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const p = n => String(n).padStart(2, '0');
    return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}

/** "5 min", "1 h 30 min": a timer's length, its name when it has no label. */
export function durationName(ms, _ = s => s) {
    if (ms < 60000)
        return _('%d s').replace('%d', String(Math.round(ms / 1000)));
    const min = Math.round(ms / 60000);
    const h = Math.floor(min / 60);
    const m = min % 60;
    const hours = _('%d h').replace('%d', String(h));
    const mins = _('%d min').replace('%d', String(m));
    if (!h)
        return mins;
    return m ? `${hours} ${mins}` : hours;
}

/** The start buttons of the Timers widget, in minutes (macOS's Clock presets). */
export const TIMER_PRESETS = Object.freeze([1, 3, 5, 10, 15, 30]);

// ---- icon grids (favourite apps) ---------------------------------------------------------

/** Columns and rows of an icon grid per size class. */
export const TILE_GRID = Object.freeze({
    small: Object.freeze({ cols: 2, rows: 2 }),
    medium: Object.freeze({ cols: 4, rows: 2 }),
    large: Object.freeze({ cols: 4, rows: 4 }),
    extraLarge: Object.freeze({ cols: 8, rows: 4 }),
});
