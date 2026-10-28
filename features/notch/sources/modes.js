// SPDX-License-Identifier: GPL-3.0-or-later
// Mode changes as short pills, like the macOS Dynamic Island: Low Power Mode on or off
// (features/lowPower, 'low-power-changed') and a Focus starting or ending (features/focus,
// 'focus-changed'). Only a change from a known state shows (model.modeChanged): the states
// when the notch starts are read from the running features, never announced.

import { modeChanged } from '../model.js';

/**
 * @param {CleanupRegistry} cleanup
 * @param {{events: object, features: {instance: (id: string) => object|null}}} ctx
 * @param {{activity: Function}} sink
 */
export function watchModes(cleanup, { events, features }, sink) {
    const lowPower = features.instance('low-power');
    let power = lowPower ? { key: lowPower.active ? 'on' : 'off' } : null;
    const focus = features.instance('focus')?.state?.() ?? null;
    let mode = focus ? { key: focus.id ?? null, data: focus.id ? { name: focus.name, icon: focus.icon } : null } : null;

    events.on('low-power-changed', ({ active }) => {
        const now = { key: active ? 'on' : 'off' };
        if (modeChanged(power, now))
            sink.activity('mode-alert', 'low-power', { active: !!active }, { fresh: true });
        power = now;
    }, cleanup);

    events.on('focus-changed', ({ id, name, icon }) => {
        const now = { key: id ?? null, data: id ? { name, icon } : null };
        if (modeChanged(mode, now)) {
            // Ending: name the Focus that ended
            const shown = id ? now.data : mode.data;
            sink.activity('mode-alert', 'focus', { active: !!id, name: shown?.name ?? null, icon: shown?.icon ?? null },
                { fresh: true });
        }
        mode = now;
    }, cleanup);
}
