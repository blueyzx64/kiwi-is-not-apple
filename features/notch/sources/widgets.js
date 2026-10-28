// SPDX-License-Identifier: GPL-3.0-or-later
// State for the Widgets tab's Controls tile that lives in the Shell: the microphone (the
// Shell's mixer control, js/ui/status/volume.js getMixerControl, GNOME 45-51), read on
// signals only. (Weather and events come from core/widgets now.)

import { getMixerControl } from 'resource:///org/gnome/shell/ui/status/volume.js';

/**
 * @param {CleanupRegistry} cleanup
 * @param {() => void} onChange called when mic() may have changed
 * @returns {{mic: () => {available: boolean, muted: boolean}, toggleMic: () => void}}
 */
export function watchWidgets(cleanup, onChange) {
    const control = getMixerControl();
    let stream = null;
    let streamId = 0;
    const dropStream = () => {
        if (stream && streamId)
            stream.disconnect(streamId);
        stream = null;
        streamId = 0;
    };
    const follow = () => {
        dropStream();
        stream = control?.get_default_source?.() ?? null;
        if (stream)
            streamId = stream.connect('notify::is-muted', onChange);
        onChange();
    };
    if (control) {
        cleanup.connect(control, 'default-source-changed', follow);
        cleanup.connect(control, 'state-changed', follow);
    }
    cleanup.add(dropStream);
    follow();

    return {
        mic: () => ({ available: !!stream, muted: !!stream?.is_muted }),
        toggleMic: () => stream?.change_is_muted(!stream.is_muted),
    };
}
