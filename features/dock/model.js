// SPDX-License-Identifier: GPL-3.0-or-later
// Kiwi dock: the pure decisions (no gi imports). index.js and the views feed it plain values.
//
//   readConfig(get)            settings -> a frozen config object
//   dockItems(...)             what the dock shows, in order (macOS layout)
//   pushRecent / stableOrder   the recent section and a running order that does not jump
//   clickAction / nextWindow   what a click on an app icon does
//   menuEntries                the right-click menu of an app icon
//   dockMetrics                sizes in px for one icon size
//   Reveal                     auto-hide: when the dock shows and hides
//   Downloads stack            downloadEntry, sortDownloads, packageKind, stackView, fanLayout
//   Open at Login              autostartState, autostartText (Kiwi-marked files only)
//   dropIndex / pinPosition    drag-reorder targets
//
// macOS references: docs/research/macos/native-apps-and-system-ui.md (Dock) and
// installer-and-app-lifecycle.md (Downloads stack).

export const POSITIONS = Object.freeze(['bottom', 'left', 'right']);
export const STACK_VIEWS = Object.freeze(['automatic', 'fan', 'grid', 'list']);

/** "Show suggested and recent apps in Dock" keeps three apps (macOS). */
export const RECENT_MAX = 3;

/** Icon sizes the Size setting allows (macOS's slider spans about 16..128). */
export const ICON_SIZE_MIN = 24;
export const ICON_SIZE_MAX = 128;

/** A fan stays readable up to this many files; more open as a grid (macOS "Automatic"). */
export const FAN_MAX = 10;

/** Desktop-entry key that marks an autostart file as Kiwi's (the only kind Kiwi removes). */
export const AUTOSTART_MARK = 'X-Kiwi-Autostart';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * The dock's config from its settings.
 *
 * @param {{bool: Function, int: Function, string: Function}} get typed getters (KiwiSettings)
 * @returns {object} frozen
 */
export function readConfig(get) {
    const position = get.string('dock-position');
    const view = get.string('dock-downloads-view');
    return Object.freeze({
        position: POSITIONS.includes(position) ? position : 'bottom',
        iconSize: clamp(get.int('dock-icon-size'), ICON_SIZE_MIN, ICON_SIZE_MAX),
        autohide: get.bool('dock-autohide'),
        autohideDelay: Math.max(0, get.int('dock-autohide-delay')),
        showRecents: get.bool('dock-show-recents'),
        runningDots: get.bool('dock-running-dots'),
        minimizeToApp: get.bool('dock-minimize-to-app'),
        downloads: get.bool('dock-downloads'),
        stackView: STACK_VIEWS.includes(view) ? view : 'automatic',
    });
}

/** True for a dock along the bottom edge (icons in a row). */
export const isHorizontal = position => position === 'bottom';

/**
 * Sizes for one icon size. The dock floats a small gap off the edge (Big Sur); the claim on the
 * edge includes the gap, so windows never touch the dock.
 *
 * @param {number} iconSize px
 * @returns {{icon, tile, padding, gap, thickness, size, radius, tileRadius, dot}}
 */
export function dockMetrics(iconSize) {
    const icon = clamp(Math.round(iconSize), ICON_SIZE_MIN, ICON_SIZE_MAX);
    const itemPad = Math.max(3, Math.round(icon / 12));
    const tile = icon + 2 * itemPad;
    const padding = Math.max(4, Math.round(icon / 8));
    const gap = Math.max(4, Math.round(icon / 8));
    const thickness = tile + 2 * padding;
    const radius = Math.round(thickness * 0.3);
    return Object.freeze({
        icon, tile, padding, gap, thickness,
        size: thickness + gap,
        radius,
        tileRadius: Math.max(4, radius - padding),
        dot: Math.max(4, Math.round(icon / 12)),
    });
}

/** `prev` order for the ids still in `current`, then the new ones in `current` order. */
export function stableOrder(prev, current) {
    const now = new Set(current);
    const kept = prev.filter(id => now.has(id));
    const seen = new Set(kept);
    return [...kept, ...current.filter(id => !seen.has(id))];
}

/** The recent list with `appId` first (deduplicated, at most `max`). */
export function pushRecent(recents, appId, max = RECENT_MAX) {
    if (!appId)
        return recents;
    return [appId, ...recents.filter(id => id !== appId)].slice(0, max);
}

/**
 * What the dock shows, in order (macOS):
 *   pinned apps | separator | running unpinned and recent apps | separator | minimized
 *   windows, Downloads, Trash
 * With recents off, running unpinned apps follow the pinned ones with no separator.
 *
 * @param {object} p
 * @param {string[]} p.pinned favourites, in order
 * @param {string[]} p.running running app ids, in a stable order
 * @param {string[]} p.recents recent unpinned app ids, newest first
 * @param {boolean} p.showRecents
 * @param {number[]} [p.minimized] window ids that get their own tile
 * @param {boolean} [p.downloads] show the Downloads stack
 * @returns {object[]} {kind: 'app'|'separator'|'window'|'downloads'|'trash', id, ...}
 */
export function dockItems({ pinned, running, recents, showRecents, minimized = [], downloads = true }) {
    const items = [];
    const live = new Set(running);
    const pinnedSet = new Set(pinned);
    for (const id of pinned)
        items.push({ kind: 'app', id, section: 'pinned', running: live.has(id) });
    const unpinned = running.filter(id => !pinnedSet.has(id));
    let second = unpinned.map(id => ({ kind: 'app', id, section: 'running', running: true }));
    if (showRecents) {
        const closed = recents.filter(id => !live.has(id) && !pinnedSet.has(id))
            .slice(0, Math.max(0, RECENT_MAX - unpinned.length));
        second = [
            ...unpinned.map(id => ({ kind: 'app', id, section: 'recent', running: true })),
            ...closed.map(id => ({ kind: 'app', id, section: 'recent', running: false })),
        ];
        if (second.length && items.length)
            items.push({ kind: 'separator', id: 'separator-recent' });
    }
    items.push(...second);
    items.push({ kind: 'separator', id: 'separator-system' });
    for (const windowId of minimized)
        items.push({ kind: 'window', id: `window-${windowId}`, windowId });
    if (downloads)
        items.push({ kind: 'downloads', id: 'downloads' });
    items.push({ kind: 'trash', id: 'trash' });
    return items;
}

/**
 * The window after `focusedId` in the app's window list (cycling), or the first.
 *
 * @param {{id: number}[]} windows most recently used first
 * @param {?number} focusedId
 * @returns {?number}
 */
export function nextWindow(windows, focusedId) {
    if (!windows.length)
        return null;
    const i = windows.findIndex(w => w.id === focusedId);
    if (i < 0)
        return windows[0].id;
    // MRU order puts the focused window first; cycle to the least recently used one so that
    // repeated clicks visit every window, as GNOME's dash and Dash to Dock do
    return windows[(i + windows.length - 1) % windows.length].id;
}

/**
 * What a click on an app icon does.
 *   - Not running: launch it.
 *   - Middle click: a new window (when the app can open one).
 *   - Running, not in front: bring its most recent window (un-minimizing it).
 *   - In front with one window: nothing, as on macOS.
 *   - In front with several windows: the next one (cycle).
 *
 * @param {object} p
 * @param {{id: number, minimized: boolean}[]} p.windows the app's windows, most recent first
 * @param {boolean} p.focused the app owns the focused window
 * @param {?number} p.focusedWindow id of the focused window
 * @param {number} p.button 1 primary, 2 middle
 * @param {boolean} p.canNewWindow
 * @returns {{type: 'launch'|'new-window'|'activate'|'none', windowId?: number}}
 */
export function clickAction({ windows, focused, focusedWindow, button, canNewWindow }) {
    if (button === 2 && canNewWindow)
        return { type: 'new-window' };
    if (!windows.length)
        return { type: 'launch' };
    if (!focused)
        return { type: 'activate', windowId: windows[0].id };
    const visible = windows.filter(w => !w.minimized);
    if (visible.length <= 1 && windows.length <= 1)
        return { type: 'none' };
    return { type: 'activate', windowId: nextWindow(windows, focusedWindow) };
}

/** Drop separators at the ends and repeated ones. */
function tidy(entries) {
    const out = [];
    for (const e of entries) {
        if (e.type === 'separator' && (!out.length || out[out.length - 1].type === 'separator'))
            continue;
        out.push(e);
    }
    while (out.length && out[out.length - 1].type === 'separator')
        out.pop();
    return out;
}

/**
 * The right-click menu of an app icon (macOS order): open windows; desktop actions; New Window
 * (or Open); Options ▸ Keep in Dock, Open at Login, Show in Files; Quit (Force Quit with Alt).
 *
 * @param {object} p
 * @param {{id, title, minimized}[]} p.windows
 * @param {?number} p.focusedWindow
 * @param {{id: string, name: string}[]} p.actions desktop actions of the .desktop file
 * @param {boolean} p.canNewWindow
 * @param {boolean} p.pinned
 * @param {boolean} p.hasDesktopFile false for window-backed apps (no file to pin or autostart)
 * @param {{enabled: boolean, editable: boolean}} p.autostart
 * @param {boolean} p.alt Alt (Option) held: Quit becomes Force Quit
 * @returns {object[]} entries {type, ...}
 */
export function menuEntries({ windows, focusedWindow, actions, canNewWindow, pinned, hasDesktopFile, autostart, alt }) {
    const running = windows.length > 0;
    const entries = windows.map(w => ({
        type: 'window', id: w.id, title: w.title || '', focused: w.id === focusedWindow, minimized: !!w.minimized,
    }));
    entries.push({ type: 'separator' });
    // An app's own "new-window" action would repeat the New Window item
    const ownNewWindow = running && canNewWindow;
    for (const a of actions.filter(x => !(ownNewWindow && /^new-?window$/i.test(x.id))))
        entries.push({ type: 'action', id: a.id, label: a.name });
    if (running && canNewWindow)
        entries.push({ type: 'new-window' });
    else if (!running)
        entries.push({ type: 'open' });
    entries.push({ type: 'separator' });
    entries.push({
        type: 'options',
        items: [
            { type: 'keep-in-dock', checked: pinned, sensitive: hasDesktopFile },
            { type: 'open-at-login', checked: autostart.enabled, sensitive: hasDesktopFile && autostart.editable },
            { type: 'show-in-files', sensitive: hasDesktopFile },
        ],
    });
    if (running) {
        entries.push({ type: 'separator' });
        entries.push({ type: alt ? 'force-quit' : 'quit' });
    }
    return tidy(entries);
}

/**
 * Index at which a dragged item lands among items whose centres (along the dock) are given.
 *
 * @param {number[]} centres in order
 * @param {number} coord pointer position along the dock
 * @returns {number} 0..centres.length
 */
export function dropIndex(centres, coord) {
    let i = 0;
    while (i < centres.length && centres[i] < coord)
        i++;
    return i;
}

/**
 * Favourites position for a drop: dropping anywhere among the apps pins there (macOS: dragging
 * a recent app into the pinned part keeps it). Past the pinned apps means "last pinned".
 *
 * @param {string[]} pinned current favourites without the dragged app
 * @param {number} index dropIndex() over the centres of those pinned apps
 * @returns {number}
 */
export function pinPosition(pinned, index) {
    return clamp(index, 0, pinned.length);
}

// ---- Downloads stack ------------------------------------------------------------------------

const PARTIAL = /\.(part|crdownload|download|partial)$/i;

/** 'rpm' | 'flatpak' | 'appimage' | null: packages get a badge (install flow). */
export function packageKind(name) {
    const n = (name ?? '').toLowerCase();
    if (n.endsWith('.rpm'))
        return 'rpm';
    if (n.endsWith('.flatpakref') || n.endsWith('.flatpak'))
        return 'flatpak';
    if (n.endsWith('.appimage'))
        return 'appimage';
    return null;
}

/**
 * One file of the Downloads folder as the stack sees it.
 *
 * @param {{name: string, displayName?: string, hidden?: boolean, backup?: boolean,
 *   changed?: number, created?: number, modified?: number}} info times in seconds
 * @returns {?object} null for files the stack never shows (hidden, backups)
 */
export function downloadEntry(info) {
    if (!info.name || info.hidden || info.backup || info.name.startsWith('.'))
        return null;
    // "Date Added": the moment the file arrived in the folder. A move or rename into the folder
    // sets ctime; birth time when the file was made there; mtime as the last resort.
    const added = Math.max(info.changed ?? 0, info.created ?? 0) || (info.modified ?? 0);
    const partial = PARTIAL.test(info.name);
    return Object.freeze({
        name: info.name,
        label: (info.displayName ?? info.name).replace(PARTIAL, ''),
        added,
        partial,
        badge: partial ? null : packageKind(info.name),
    });
}

/** Newest first (Date Added), names breaking ties so the order is stable. */
export function sortDownloads(entries) {
    return [...entries].sort((a, b) => b.added - a.added || a.name.localeCompare(b.name));
}

/**
 * A download that just finished: a file that was partial in `before` and is now final, or a
 * new final file whose partial twin is gone.
 *
 * @param {object[]} before entries
 * @param {object[]} after entries
 * @returns {boolean}
 */
export function downloadFinished(before, after) {
    const partials = new Set(before.filter(e => e.partial).map(e => e.label));
    if (!partials.size)
        return false;
    const stillPartial = new Set(after.filter(e => e.partial).map(e => e.label));
    return after.some(e => !e.partial && partials.has(e.label) && !stillPartial.has(e.label));
}

/**
 * The view a stack opens in. A fan only rises from a bottom dock; Automatic picks the fan for a
 * short stack and the grid otherwise (macOS).
 *
 * @param {string} setting 'automatic' | 'fan' | 'grid' | 'list'
 * @param {string} position dock position
 * @param {number} count files
 * @returns {'fan'|'grid'|'list'}
 */
export function stackView(setting, position, count) {
    const bottom = isHorizontal(position);
    if (setting === 'grid' || setting === 'list')
        return setting;
    if (setting === 'fan')
        return bottom ? 'fan' : 'list';
    return bottom && count <= FAN_MAX ? 'fan' : 'grid';
}

/**
 * Rows of the fan, nearest the dock first: each row a little higher, further right and turned
 * a little more, so the column bends like the macOS fan.
 *
 * @param {number} count rows
 * @param {number} step px between rows
 * @returns {{dx: number, dy: number, angle: number}[]} offsets from the stack icon centre
 *   (dy negative is up), angle in degrees (clockwise)
 */
export function fanLayout(count, step) {
    const rows = [];
    for (let i = 0; i < count; i++) {
        const t = i / Math.max(1, FAN_MAX - 1);
        rows.push({
            dx: Math.round(step * 1.6 * t * t),
            dy: -Math.round(step * (i + 1)),
            angle: Math.round((2 + 10 * t) * 10) / 10,
        });
    }
    return rows;
}

// ---- Open at Login ---------------------------------------------------------------------------

/** The [Desktop Entry] keys of a .desktop text (first group only). */
function entryKeys(text) {
    const keys = new Map();
    let inEntry = false;
    for (const raw of (text ?? '').split('\n')) {
        const line = raw.trim();
        if (line.startsWith('[')) {
            inEntry = line === '[Desktop Entry]';
            continue;
        }
        const eq = line.indexOf('=');
        if (inEntry && eq > 0)
            keys.set(line.slice(0, eq).trim(), line.slice(eq + 1).trim());
    }
    return keys;
}

/**
 * The Open at Login state from the app's autostart file.
 *
 * @param {?string} text the file's contents, null when there is none
 * @returns {{enabled: boolean, kiwi: boolean, editable: boolean}} editable: Kiwi may change
 *   it (no file yet, or a file Kiwi wrote)
 */
export function autostartState(text) {
    if (text === null || text === undefined)
        return { enabled: false, kiwi: false, editable: true };
    const keys = entryKeys(text);
    const kiwi = keys.get(AUTOSTART_MARK) === 'true';
    const enabled = keys.get('Hidden') !== 'true' && keys.get('X-GNOME-Autostart-enabled') !== 'false';
    return { enabled, kiwi, editable: kiwi };
}

/**
 * The autostart file Kiwi writes: the app's own desktop entry, marked as Kiwi's, without the
 * keys that would keep it from starting.
 *
 * @param {string} desktopText the app's .desktop file
 * @returns {string}
 */
export function autostartText(desktopText) {
    const out = [];
    let inEntry = false;
    for (const raw of desktopText.split('\n')) {
        const line = raw.trim();
        if (line.startsWith('[')) {
            inEntry = line === '[Desktop Entry]';
            out.push(raw);
            if (inEntry)
                out.push(`${AUTOSTART_MARK}=true`);
            continue;
        }
        if (inEntry && /^(Hidden|X-GNOME-Autostart-enabled|X-Kiwi-Autostart)\s*=/.test(line))
            continue;
        out.push(raw);
    }
    return `${out.join('\n').trimEnd()}\n`;
}

// ---- Auto-hide -------------------------------------------------------------------------------

/**
 * When an auto-hiding dock shows. The adapter reports what happens (hover on the edge and on
 * the dock, pressure, its delay timer, things that keep the dock up) and calls settle() once
 * per batch of events, so the leave of one actor and the enter of the next never hide the dock
 * in between. `visible` and `wantsTimer` are what it applies.
 *   - Off: always visible.
 *   - The pointer resting on the screen edge arms the delay; when it fires the dock shows.
 *     Pushing against the edge (pressure) shows it at once.
 *   - It hides as soon as the pointer has left it, unless a menu, a stack or a drag holds it.
 */
export class Reveal {
    constructor(autohide = false) {
        this._autohide = autohide;
        this._shown = false;
        this._edge = false;
        this._hover = false;
        this._holds = 0;
    }

    get visible() {
        return !this._autohide || this._shown;
    }

    /** The adapter should run the reveal delay now (the pointer rests on the edge). */
    get wantsTimer() {
        return this._autohide && !this._shown && this._edge;
    }

    get holds() {
        return this._holds;
    }

    setAutohide(on) {
        this._autohide = on;
        this._shown = false;
    }

    edge(hovered) {
        this._edge = hovered;
    }

    dock(hovered) {
        this._hover = hovered;
    }

    /** The reveal delay ran out, or the pointer pushed against the edge. */
    reveal() {
        if (this._autohide)
            this._shown = true;
    }

    hold() {
        this._holds++;
    }

    unhold() {
        this._holds = Math.max(0, this._holds - 1);
    }

    /** Apply the rules after a batch of inputs. @returns {boolean} visible */
    settle() {
        if (this._shown && !this._hover && !this._edge && this._holds === 0)
            this._shown = false;
        return this.visible;
    }
}
