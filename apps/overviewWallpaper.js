// SPDX-License-Identifier: GPL-3.0-or-later
// Shows the wallpaper behind the overview, dimmed, instead of the theme's flat colour.
//
// No blur and no shader (Liquid Glass is plain transparency): one Meta.BackgroundGroup at
// the bottom of the overview holds, per monitor, the wallpaper (BackgroundManager keeps it
// on the current picture and its light/dark variant) and a translucent black St.Widget over
// it. The dim strength follows the colour scheme, as the old ImageMagick path did
// (20 % dark, 35 % light): see .kiwi-overview-dim in stylesheet.css.

import Meta from 'gi://Meta';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Background from 'resource:///org/gnome/shell/ui/background.js';

const GROUP_NAME = 'kiwi-overview-wallpaper-group';
const DIM_LIGHT_CLASS = 'kiwi-overview-dim-light';

let _enabled = false;
let _group = null;
let _managers = [];
let _dims = [];
const _groupSignals = [];   // reconnected on every rebuild
const _globalSignals = [];  // live for as long as the module is enabled

function _disconnect(list) {
    for (const [obj, id] of list)
        obj.disconnect(id);
    list.length = 0;
}

function _syncScheme() {
    const light = St.Settings.get().colorScheme === St.SystemColorScheme.PREFER_LIGHT;
    for (const dim of _dims) {
        if (light)
            dim.add_style_class_name(DIM_LIGHT_CLASS);
        else
            dim.remove_style_class_name(DIM_LIGHT_CLASS);
    }
}

function _teardown() {
    _disconnect(_groupSignals);

    // Each manager owns the Meta.BackgroundActor it parented into its holder, so it
    // has to go before the holders are destroyed under it.
    _managers.forEach(manager => manager.destroy());
    _managers = [];
    _dims = [];

    if (_group) {
        _group.get_parent()?.remove_child(_group);
        _group.destroy_all_children();
        _group.destroy();
        _group = null;
    }
}

function _build() {
    _teardown();

    _group = new Meta.BackgroundGroup({ name: GROUP_NAME });

    Main.layoutManager.monitors.forEach((monitor, index) => {
        const geometry = { x: monitor.x, y: monitor.y, width: monitor.width, height: monitor.height };
        const holder = new St.Widget(geometry);

        // BackgroundManager parents a Meta.BackgroundActor into the holder and keeps
        // it on the current wallpaper. controlPosition:false skips its own layout
        // pass, which would reorder siblings and flash the bare colour through
        // while a new background loads.
        _managers.push(new Background.BackgroundManager({
            container: holder,
            monitorIndex: index,
            controlPosition: false,
        }));
        _group.add_child(holder);

        // A sibling above the holder, so a newly loaded wallpaper never lands over it
        const dim = new St.Widget({ ...geometry, style_class: 'kiwi-overview-dim', reactive: false });
        _group.add_child(dim);
        _dims.push(dim);
    });
    _syncScheme();

    const overviewGroup = Main.layoutManager.overviewGroup;
    overviewGroup.insert_child_at_index(_group, 0);

    // Anything the shell adds to overviewGroup later would otherwise land beneath
    // the wallpaper and be hidden by it.
    _groupSignals.push([overviewGroup, overviewGroup.connect('child-added', (group, child) => {
        if (child !== _group)
            group.set_child_below_sibling(_group, null);
    })]);
}

export function enable() {
    if (_enabled)
        return;
    _enabled = true;

    _build();

    // A monitor change invalidates every holder's geometry, so rebuild outright.
    _globalSignals.push([Main.layoutManager,
        Main.layoutManager.connect('monitors-changed', () => _build())]);
    // The colour scheme changes the dim; the wallpaper swap is BackgroundManager's job.
    const st = St.Settings.get();
    _globalSignals.push([st, st.connect('notify::color-scheme', () => _syncScheme())]);
}

export function disable() {
    _enabled = false;
    _disconnect(_globalSignals);
    _teardown();
}
