// SPDX-License-Identifier: GPL-3.0-or-later
// Control Center shell adapter: the only file that reads Quick Settings private fields.
//
// Checked against gnome-shell 48.0, 49.0, 50.0 and main (51):
//   js/ui/panel.js       QuickSettings: _network _bluetooth _system _volumeOutput _volumeInput
//                        _brightness _backlight _nightLight _darkMode _powerProfiles
//                        _rfkill _autoRotate _location _camera _remoteAccess _thunderbolt
//                        _unsafeMode _backgroundApps, all set together after the async
//                        imports; _doNotDisturb exists from 49 on.
//   js/ui/status/network.js  Indicator: _wirelessToggle _wiredToggle _modemToggle _btToggle _vpnToggle
//   js/ui/quickSettings.js   QuickSettingsMenu._grid; its layout manager has `nColumns`, a
//                        per-child `column-span`, and `_overlay` (a placeholder child that the
//                        layout skips and that must stay in the grid).
//   js/ui/status/system.js   SystemItem.child (St.BoxLayout), powerToggle._proxy (UPower.Device).

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { COLUMNS, restoreOrder } from './model.js';

/** The Quick Settings panel button once its built-in items exist, else null. */
export function readyQuickSettings() {
    const qs = Main.panel.statusArea.quickSettings;
    // _backgroundApps is the last field _setupIndicators assigns
    return qs?._backgroundApps && qs._system && qs.menu?._grid ? qs : null;
}

/** @returns {Map<Clutter.Actor, string>} stock item actor -> model key */
export function stockKeys(qs) {
    const keys = new Map();
    const tag = (key, items) => {
        for (const item of items ?? []) {
            if (item)
                keys.set(item, key);
        }
    };
    const items = indicator => indicator?.quickSettingsItems;

    const net = qs._network;
    tag('wifi', [net?._wirelessToggle]);
    tag('wired', [net?._wiredToggle]);
    tag('modem', [net?._modemToggle]);
    tag('bt-tether', [net?._btToggle]);
    tag('vpn', [net?._vpnToggle]);
    tag('bluetooth', items(qs._bluetooth));
    tag('dnd', items(qs._doNotDisturb));
    tag('brightness', items(qs._brightness));
    tag('backlight', items(qs._backlight));
    tag('volume-out', items(qs._volumeOutput));
    tag('volume-in', items(qs._volumeInput));
    tag('dark-style', items(qs._darkMode));
    tag('night-light', items(qs._nightLight));
    tag('power-saver', items(qs._powerProfiles));
    tag('rotation', items(qs._autoRotate));
    tag('airplane', items(qs._rfkill));
    tag('location', items(qs._location));
    tag('camera', items(qs._camera));
    tag('remote-access', items(qs._remoteAccess));
    tag('thunderbolt', items(qs._thunderbolt));
    tag('unsafe', items(qs._unsafeMode));
    tag('background-apps', items(qs._backgroundApps));
    tag('system', items(qs._system));
    return keys;
}

/** The grid's placeholder child: the layout skips it, so it is never planned or moved. */
function placeholder(grid) {
    return grid.layout_manager._overlay ?? null;
}

export function columnSpan(grid, actor) {
    try {
        return grid.layout_manager.get_child_meta(grid, actor).columnSpan;
    } catch (_e) {
        return 1;
    }
}

function setSpan(grid, actor, span) {
    grid.layout_manager.child_set_property(grid, actor, 'column-span', span);
}

/** Children the plan manages: everything in the grid except the placeholder. */
export function managedChildren(grid) {
    const skip = placeholder(grid);
    return grid.get_children().filter(child => child !== skip);
}

/**
 * Remember how the grid looked. Holds actors, not their parent: on restore the live grid is
 * used, so a grid that was rebuilt in between cannot receive stale parent/index pairs.
 */
export function snapshotGrid(grid) {
    const layout = grid.layout_manager;
    // Every child, the placeholder included, so restore also gives it back its z-order slot
    const actors = grid.get_children();
    return {
        columns: layout.nColumns,
        actors,
        spans: new Map(actors.map(actor => [actor, columnSpan(grid, actor)])),
    };
}

/**
 * Apply a plan.
 *
 * @param {St.Widget} grid
 * @param {{actor: Clutter.Actor, span: number}[]} placed in final order
 */
export function applyPlan(grid, placed) {
    const layout = grid.layout_manager;
    layout.nColumns = COLUMNS;
    for (const { actor, span } of placed) {
        if (actor.get_parent() !== grid)
            continue;
        if (columnSpan(grid, actor) !== span)
            setSpan(grid, actor, span);
        // Raising to the top in plan order leaves the placeholder first, in front of all
        grid.set_child_above_sibling(actor, null);
    }
    layout.layout_changed();
}

/**
 * Put the grid back as the snapshot saw it. Actors that have left the grid are skipped;
 * the order comes from restoreOrder(), so nothing is inserted into a foreign parent.
 * `stockSpans` (actor -> span it arrived with) covers actors the snapshot never saw.
 */
export function restoreGrid(grid, snapshot, stockSpans = new Map()) {
    if (!grid || !snapshot)
        return;
    const layout = grid.layout_manager;
    for (const actor of restoreOrder(snapshot.actors, grid.get_children())) {
        // Actors that joined after the snapshot go back to the span they arrived with
        const span = snapshot.spans.get(actor) ?? stockSpans.get(actor) ?? 1;
        if (columnSpan(grid, actor) !== span)
            setSpan(grid, actor, span);
        grid.set_child_above_sibling(actor, null);
    }
    layout.nColumns = snapshot.columns;
    layout.layout_changed();
}

/**
 * Hide the Do Not Disturb button apps/quickSettingsNotifications.js put in the footer
 * before the Control Center started (it adds none afterwards). Returns the undo.
 */
export function hideLegacyDndButton(qs) {
    const button = qs._system?._systemItem?.child.get_children()
        .find(child => child.style_class?.includes('kiwi-dnd-button'));
    if (!button)
        return () => {};
    let destroyed = false;
    const id = button.connect('destroy', () => {
        destroyed = true;
    });
    const wasVisible = button.visible;
    button.hide();
    return () => {
        if (destroyed)
            return;
        button.disconnect(id);
        button.visible = wasVisible;
    };
}
