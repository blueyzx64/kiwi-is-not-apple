// SPDX-License-Identifier: GPL-3.0-or-later
// The accessibility switches Kiwi offers in more than one place (the Control Center gallery,
// the Accessibility Shortcuts panel): each one a GNOME setting flipped on and off. Pure: no gi
// imports, so it runs under `gjs -m`.
//
//   binding: {schema, key, type: 'b'|'d', invert?, on?, off?}
//     type 'b': on = true (false with invert); type 'd': on/off are the two values

const N_ = s => s;

/** Every switch by id: [id, title, icon, binding]. Titles follow macOS. */
export const A11Y_SWITCHES = Object.freeze([
    ['text-size', N_('Text Size'), 'zoom-in-symbolic',
        { schema: 'org.gnome.desktop.interface', key: 'text-scaling-factor', type: 'd', on: 1.25, off: 1.0 }],
    ['high-contrast', N_('Increase Contrast'), 'view-reveal-symbolic',
        { schema: 'org.gnome.desktop.a11y.interface', key: 'high-contrast', type: 'b' }],
    ['reduce-motion', N_('Reduce Motion'), 'emblem-synchronizing-symbolic',
        { schema: 'org.gnome.desktop.interface', key: 'enable-animations', type: 'b', invert: true }],
    ['screen-reader', N_('VoiceOver'), 'audio-speakers-symbolic',
        { schema: 'org.gnome.desktop.a11y.applications', key: 'screen-reader-enabled', type: 'b' }],
    ['screen-keyboard', N_('Accessibility Keyboard'), 'input-keyboard-symbolic',
        { schema: 'org.gnome.desktop.a11y.applications', key: 'screen-keyboard-enabled', type: 'b' }],
    ['sticky-keys', N_('Sticky Keys'), 'preferences-desktop-keyboard-symbolic',
        { schema: 'org.gnome.desktop.a11y.keyboard', key: 'stickykeys-enable', type: 'b' }],
    ['visual-alerts', N_('Flash Screen for Alerts'), 'dialog-warning-symbolic',
        { schema: 'org.gnome.desktop.wm.preferences', key: 'visual-bell', type: 'b' }],
    ['zoom', N_('Zoom'), 'zoom-in-symbolic',
        { schema: 'org.gnome.desktop.a11y.applications', key: 'screen-magnifier-enabled', type: 'b' }],
    ['slow-keys', N_('Slow Keys'), 'preferences-desktop-keyboard-symbolic',
        { schema: 'org.gnome.desktop.a11y.keyboard', key: 'slowkeys-enable', type: 'b' }],
    ['bounce-keys', N_('Bounce Keys'), 'preferences-desktop-keyboard-symbolic',
        { schema: 'org.gnome.desktop.a11y.keyboard', key: 'bouncekeys-enable', type: 'b' }],
    ['mouse-keys', N_('Mouse Keys'), 'input-mouse-symbolic',
        { schema: 'org.gnome.desktop.a11y.keyboard', key: 'mousekeys-enable', type: 'b' }],
    ['locate-pointer', N_('Locate Pointer'), 'input-mouse-symbolic',
        { schema: 'org.gnome.desktop.interface', key: 'locate-pointer', type: 'b' }],
].map(([id, title, icon, binding]) => Object.freeze({ id, title, icon, binding: Object.freeze(binding) })));

const BY_ID = new Map(A11Y_SWITCHES.map(s => [s.id, s]));

/** @returns {?object} the switch with this id */
export function a11ySwitch(id) {
    return BY_ID.get(id) ?? null;
}

/** The switches with these ids, in this order (unknown ids are skipped). */
export function a11ySwitches(ids) {
    return ids.map(id => BY_ID.get(id)).filter(Boolean);
}

/** Whether a setting value means "on" for a binding. */
export function isOn(binding, value) {
    if (binding.type === 'd')
        return Math.abs(value - binding.on) < 1e-6;
    return binding.invert ? !value : !!value;
}

/** The value to write to turn a binding on or off. */
export function valueFor(binding, on) {
    if (binding.type === 'd')
        return on ? binding.on : binding.off;
    return binding.invert ? !on : !!on;
}
