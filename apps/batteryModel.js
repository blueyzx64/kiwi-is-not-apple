// SPDX-License-Identifier: GPL-3.0-or-later
// Pure rules for the low-battery label (no Shell imports, unit-testable).

// UPower Device.State values
export const STATE_CHARGING = 1;
export const STATE_DISCHARGING = 2;

/**
 * The label shows while the battery runs down at or below the threshold.
 * Callers compare this with the last answer (an edge flag) so the slide
 * animation plays on the change only, even if the exact threshold value is
 * skipped (21% straight to 19%) or the app starts below it.
 *
 * @param percentage charge, 0-100
 * @param state UPower state
 * @param threshold show at or below this charge
 */
export function shouldShowLabel(percentage, state, threshold) {
    return percentage <= threshold && state === STATE_DISCHARGING;
}
