// SPDX-License-Identifier: GPL-3.0-or-later
// Quick Settings is built asynchronously (QuickSettings._setupIndicators awaits its items), so
// a feature started with the Shell may find it half done. Every feature that reaches into it
// waits here, in one bounded way.
//
// Private Shell API: quickSettings._backgroundApps (the last field _setupIndicators assigns),
// ._system, .menu._grid (GNOME 48-51).

import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const WAIT_MS = 200;
const WAIT_ATTEMPTS = 50; // 10 s

/** The Quick Settings panel button once its built-in items exist, else null. */
export function readyQuickSettings() {
    const qs = Main.panel.statusArea.quickSettings;
    return qs?._backgroundApps && qs._system && qs.menu?._grid ? qs : null;
}

/**
 * Call fn(quickSettings) once Quick Settings is complete: now, or from a bounded retry that
 * the cleanup cancels.
 *
 * @param {CleanupRegistry} cleanup
 * @param {(qs: object) => void} fn
 * @param {string} name for the log and the source name
 */
export function whenQuickSettingsReady(cleanup, fn, name) {
    const qs = readyQuickSettings();
    if (qs) {
        fn(qs);
        return;
    }
    let attempts = 0;
    cleanup.timeout(WAIT_MS, () => {
        const ready = readyQuickSettings();
        if (ready) {
            fn(ready);
            return GLib.SOURCE_REMOVE;
        }
        if (++attempts >= WAIT_ATTEMPTS) {
            console.error(`[Kiwi] ${name}: Quick Settings never finished building`);
            return GLib.SOURCE_REMOVE;
        }
        return GLib.SOURCE_CONTINUE;
    }, { name: `${name} waits for Quick Settings` });
}
