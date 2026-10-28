// SPDX-License-Identifier: GPL-3.0-or-later
// Battery time from UPower values. Pure, no gi imports (the Control Center's user row and
// the menu bar's Battery item).

// UPower.DeviceState values (not imported here to stay free of gi)
export const BATTERY_STATE = { CHARGING: 1, DISCHARGING: 2, FULLY_CHARGED: 4 };

/**
 * What the user row says about time. Returns null when UPower has no estimate.
 *
 * @param {{state: number, toEmpty: number, toFull: number}} battery seconds, 0 = unknown
 * @returns {{kind: 'remaining'|'until-full', hours: number, minutes: number}|null}
 */
export function batteryTime({ state, toEmpty, toFull }) {
    let kind = null;
    let seconds = 0;
    if (state === BATTERY_STATE.DISCHARGING) {
        kind = 'remaining';
        seconds = toEmpty;
    } else if (state === BATTERY_STATE.CHARGING) {
        kind = 'until-full';
        seconds = toFull;
    }
    if (!kind || !Number.isFinite(seconds) || seconds <= 0 || seconds > 99 * 3600)
        return null;
    const total = Math.round(seconds / 60);
    return { kind, hours: Math.floor(total / 60), minutes: total % 60 };
}

/**
 * The extra lines of an Option-click on the Battery item (macOS shows more there): the power
 * draw and the stored energy, from UPower's EnergyRate (W), Energy and EnergyFull (Wh). Only
 * the values UPower knows (> 0) are listed.
 *
 * @param {?{EnergyRate?: number, Energy?: number, EnergyFull?: number}} proxy
 * @returns {{kind: 'rate'|'energy', text: string}[]}
 */
export function batteryDetails(proxy) {
    const out = [];
    const ok = v => Number.isFinite(v) && v > 0;
    if (ok(proxy?.EnergyRate))
        out.push({ kind: 'rate', text: `${proxy.EnergyRate.toFixed(1)} W` });
    if (ok(proxy?.Energy) && ok(proxy?.EnergyFull))
        out.push({ kind: 'energy', text: `${proxy.Energy.toFixed(1)} / ${proxy.EnergyFull.toFixed(1)} Wh` });
    return out;
}
