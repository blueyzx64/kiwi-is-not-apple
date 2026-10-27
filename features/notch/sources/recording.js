// SPDX-License-Identifier: GPL-3.0-or-later
// Screen recording: the red capsule with elapsed time and a stop button.
//
// The activity follows the core events 'recording-started' / 'recording-stopped'. Until the
// recording owner (the screenshot package) emits them, bridgeShellRecording() emits them from
// the Shell's own screenshot UI property `screencast-in-progress` (js/ui/screenshot.js,
// GNOME 45-51), so the notch works with the stock recorder today.

import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const nowMs = () => Math.floor(GLib.get_monotonic_time() / 1000);

/** Emit the core recording events from the Shell's screenshot UI. */
export function bridgeShellRecording(cleanup, events) {
    const ui = Main.screenshotUI;
    if (!ui)
        return;
    let on = !!ui.screencast_in_progress;
    if (on)
        events.emit('recording-started', {});
    cleanup.connect(ui, 'notify::screencast-in-progress', () => {
        const next = !!ui.screencast_in_progress;
        if (next === on)
            return;
        on = next;
        events.emit(on ? 'recording-started' : 'recording-stopped', {});
    });
    cleanup.add(() => {
        if (on)
            events.emit('recording-stopped', {});
    });
}

/**
 * @param {CleanupRegistry} cleanup
 * @param {EventHub} events
 * @param {{activity: Function}} sink
 */
export function watchRecording(cleanup, events, sink) {
    let startedAt = null;
    events.on('recording-started', () => {
        startedAt ??= nowMs();
        sink.activity('recording', 'recording', { startedAt });
    }, cleanup);
    events.on('recording-stopped', () => {
        startedAt = null;
        sink.activity('recording', 'recording', null);
    }, cleanup);
    if (Main.screenshotUI?.screencast_in_progress) {
        startedAt = nowMs();
        sink.activity('recording', 'recording', { startedAt });
    }
    cleanup.add(() => sink.activity('recording', 'recording', null));
}

/** Stop the Shell's recording (the capsule's stop button). */
export function stopRecording() {
    Main.screenshotUI?.stopScreencast?.().catch?.(e => console.error('[Kiwi] notch: stop recording failed:', e));
}
