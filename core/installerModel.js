// SPDX-License-Identifier: GPL-3.0-or-later
// The pure side of the owner's installer integration (overhaul plan §9, P7): the Installer1
// D-Bus contract as data, the parsers for what the installer sends, and the progress book the
// dock and notch read. The service itself is specified in
// docs/architecture/installer-dbus-contract.md (tests/installerModel.test.js keeps that
// document and INSTALLER1_XML identical). Kiwi talks to the installer only over this API and
// never touches its ledger; with no installer running or installable everything degrades.
//
// Pure JS (no gi imports): runs under `gjs -m` in tests.

export const INSTALLER_BUS_NAME = 'io.github.blueyzx64.Installer';
export const INSTALLER_OBJECT_PATH = '/io/github/blueyzx64/Installer';
export const INSTALLER_INTERFACE = 'io.github.blueyzx64.Installer1';
/** The desktop id the installer registers (also the LauncherEntry app uri). */
export const INSTALLER_DESKTOP_ID = 'io.github.blueyzx64.Installer.desktop';
/** The oldest contract revision Kiwi needs. Revisions only add (a breaking change would be a
 *  new interface, Installer2), so a higher number is fine. */
export const SUPPORTED_VERSION = 1;

/** The interface as introspection XML. docs/architecture/installer-dbus-contract.md embeds it. */
export const INSTALLER1_XML = `<node>
  <interface name="io.github.blueyzx64.Installer1">
    <method name="Open">
      <arg type="s" name="path" direction="in"/>
      <arg type="s" name="parent_window" direction="in"/>
    </method>
    <method name="ListManagedApps">
      <arg type="a(sssb)" name="apps" direction="out"/>
    </method>
    <method name="OwnsDesktopId">
      <arg type="s" name="desktop_id" direction="in"/>
      <arg type="b" name="owned" direction="out"/>
      <arg type="s" name="app_id" direction="out"/>
    </method>
    <method name="Uninstall">
      <arg type="s" name="app_id" direction="in"/>
      <arg type="s" name="parent_window" direction="in"/>
    </method>
    <signal name="AppsChanged"/>
    <signal name="UninstallFinished">
      <arg type="s" name="app_id"/>
      <arg type="s" name="outcome"/>
    </signal>
    <signal name="Progress">
      <arg type="s" name="operation_id"/>
      <arg type="s" name="title"/>
      <arg type="s" name="phase"/>
      <arg type="i" name="percent"/>
    </signal>
    <property name="Version" type="u" access="read"/>
  </interface>
</node>`;

/** How long each call may take before Kiwi gives up (ms). Uninstall only has to be accepted:
 *  the confirmation and the removal arrive by UninstallFinished. */
export const CALL_TIMEOUT_MS = Object.freeze({ list: 5000, owns: 3000, open: 8000, uninstall: 8000 });

export const PROGRESS_PHASES = Object.freeze(['inspecting', 'authorizing', 'installing', 'finishing', 'done', 'failed']);
const ENDED_PHASES = new Set(['done', 'failed']);

const SOURCES = new Set(['appImage', 'systemPackage', 'flatpak']);

/**
 * @typedef {object} ManagedApp
 * @property {string} appId the installer's own id (what Uninstall takes)
 * @property {string} desktopId e.g. 'lumen-notes.desktop' ('' when it has none)
 * @property {string} source 'appImage' | 'systemPackage' | 'flatpak' | 'other'
 * @property {boolean} canUninstall
 */

/**
 * ListManagedApps' `a(sssb)` as plain tuples to objects. Rows that are not 4 plain fields
 * are skipped; an unknown source becomes 'other' (a newer installer may add kinds).
 *
 * @param {Array} rows [[appId, desktopId, source, canUninstall], ...]
 * @returns {ManagedApp[]}
 */
export function parseApps(rows) {
    const out = [];
    if (!Array.isArray(rows))
        return out;
    for (const row of rows) {
        if (!Array.isArray(row) || row.length < 4)
            continue;
        const [appId, desktopId, source, canUninstall] = row;
        if (typeof appId !== 'string' || !appId || typeof desktopId !== 'string')
            continue;
        out.push({
            appId, desktopId,
            source: SOURCES.has(source) ? source : 'other',
            canUninstall: canUninstall === true,
        });
    }
    return out;
}

/**
 * UninstallFinished' outcome: 'removed' | 'cancelled' | 'failed:<code>'. Anything else is a
 * failure (a wrong word must never read as success).
 *
 * @param {string} outcome
 * @returns {{kind: 'removed'|'cancelled'|'failed', code: string}}
 */
export function parseOutcome(outcome) {
    if (outcome === 'removed' || outcome === 'cancelled')
        return { kind: outcome, code: '' };
    if (typeof outcome === 'string' && outcome.startsWith('failed:'))
        return { kind: 'failed', code: outcome.slice('failed:'.length) || 'unknown' };
    return { kind: 'failed', code: 'unknown' };
}

/**
 * One Progress signal as an object. `percent` is 0..100, or null while it is indeterminate
 * (the installer sends -1); an unknown phase is kept as 'installing' (still busy).
 *
 * @returns {?{operationId: string, title: string, phase: string, percent: ?number}}
 */
export function parseProgress(operationId, title, phase, percent) {
    if (typeof operationId !== 'string' || !operationId)
        return null;
    const known = PROGRESS_PHASES.includes(phase);
    const p = Number.isFinite(percent) && percent >= 0 ? Math.min(100, Math.round(percent)) : null;
    return {
        operationId,
        title: typeof title === 'string' ? title : '',
        phase: known ? phase : 'installing',
        percent: phase === 'done' ? 100 : p,
    };
}

/** True when the installer's Version property is a revision Kiwi can talk to. */
export function isSupportedVersion(version) {
    return Number.isInteger(version) && version >= SUPPORTED_VERSION;
}

/**
 * Whether the installer can be used, from what the bus says: 'running' (owns the name),
 * 'activatable' (a service file would start it), 'incompatible' (running, but its Version is
 * older than Kiwi needs) or 'absent'. `version` is null until it has been read.
 */
export function availability({ owned, activatable, version = null }) {
    if (owned)
        return version !== null && !isSupportedVersion(version) ? 'incompatible' : 'running';
    return activatable ? 'activatable' : 'absent';
}

/** Can Kiwi make calls now (a running or startable installer with a version it knows)? */
export const isUsable = state => state === 'running' || state === 'activatable';

/**
 * The operations in flight. The dock and notch want one number for "the installer is busy":
 * the mean of the determinate operations, or null when only indeterminate ones are running.
 */
export class ProgressBook {
    constructor() {
        this._ops = new Map(); // operationId -> progress
    }

    /**
     * @param {object} progress from parseProgress
     * @returns {boolean} true when the book changed
     */
    apply(progress) {
        if (!progress)
            return false;
        const { operationId, phase } = progress;
        if (ENDED_PHASES.has(phase))
            return this._ops.delete(operationId);
        const before = this._ops.get(operationId);
        if (before && before.phase === phase && before.percent === progress.percent && before.title === progress.title)
            return false;
        this._ops.set(operationId, progress);
        return true;
    }

    get busy() {
        return this._ops.size > 0;
    }

    /** @returns {object[]} operations in flight, oldest first */
    get operations() {
        return [...this._ops.values()];
    }

    /** @returns {?number} 0..1 across the determinate operations, or null */
    get fraction() {
        let sum = 0;
        let n = 0;
        for (const op of this._ops.values()) {
            if (op.percent === null)
                continue;
            sum += op.percent;
            n++;
        }
        return n ? sum / n / 100 : null;
    }

    /** "Installing Lumen Notes… 40%" style text pieces for the notch (title, phase, percent). */
    get summary() {
        const first = this._ops.values().next().value;
        return first ? { title: first.title, phase: first.phase, percent: first.percent, count: this._ops.size } : null;
    }

    clear() {
        this._ops.clear();
    }
}
