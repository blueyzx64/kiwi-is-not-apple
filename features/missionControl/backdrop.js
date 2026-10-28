// SPDX-License-Identifier: GPL-3.0-or-later
// The desktop behind Mission Control, as on macOS: the wallpaper stays where it is, full
// screen, and the windows spread over it. GNOME instead shrinks the current Space into a
// rounded card (WorkspaceBackground) over a dark plate, with the neighbouring Spaces peeking
// in at the sides.
//
//   - A wallpaper per monitor, full screen, at the bottom of the overview (above any other
//     backdrop an extension puts there, such as a blurred one).
//   - The card is dressed down: its wallpaper hidden, no shadow. The desktop's icons and
//     widgets on it (core/desktopLayers.js mirrors them into the card) shrink and fade out
//     with it as Mission Control opens, and come back as it closes.
//   - The neighbouring Spaces only show while they scroll in (switching Space inside
//     Mission Control).
// Everything is put back on disable; the stock overview is untouched while Kiwi is off.
//
// Shell API (private, GNOME 50; js/ui/workspace.js, workspacesView.js, layout.js):
// Main.layoutManager.overviewGroup, Main.overview._overview, Workspace._background and
// .stateAdjustment, WorkspaceBackground._backgroundGroup and ._stateAdjustment,
// WorkspacesView.prototype._updateWorkspacesState, ._workspaces and ._scrollAdjustment.

import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import * as Background from 'resource:///org/gnome/shell/ui/background.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Workspace from 'resource:///org/gnome/shell/ui/workspace.js';
import * as WorkspacesView from 'resource:///org/gnome/shell/ui/workspacesView.js';

import { desktopItemsOpacity, neighbourOpacity } from './model.js';

const LOG = '[Kiwi] mission-control:';
const MIRROR_NAME = 'kiwi-desktop-mirror';     // core/desktopLayers.js

export class Backdrop {
    /** @param {CleanupRegistry} cleanup */
    constructor(cleanup) {
        this._cleanup = cleanup;
        this._group = null;
        this._managers = [];
        this._dressed = new Map();      // WorkspaceBackground -> undo()
        this._faded = new Set();        // Workspaces whose opacity Kiwi set
    }

    enable() {
        const c = this._cleanup;
        const overview = Main.overview._overview;
        if (!overview || !(Workspace.WorkspaceBackground?.prototype instanceof Clutter.Actor)) {
            console.warn(`${LOG} the overview workspaces were not found; the desktop stays a card`);
            return;
        }
        this._group = c.actor(new Clutter.Actor({ name: 'kiwi-mc-backdrop', reactive: false }));
        Main.layoutManager.overviewGroup.add_child(this._group);
        this._restack();
        this._build();
        c.add(() => this._dropWallpapers());
        c.connect(Main.layoutManager, 'monitors-changed', () => this._build());
        // Others may restack the overview group (a blur extension adds its own backdrop)
        c.connect(Main.overview, 'showing', () => {
            this._restack();
            this._dressOverview();
        });

        const self = this;
        const proto = WorkspacesView.WorkspacesView?.prototype;
        if (typeof proto?._updateWorkspacesState === 'function') {
            // Runs on every frame of the overview's transition and of a Space switch inside it
            c.inject(proto, '_updateWorkspacesState', function (orig, ...args) {
                const r = orig.apply(this, args);
                const scroll = this._scrollAdjustment?.value ?? 0;
                (this._workspaces ?? []).forEach((ws, i) => {
                    ws.opacity = neighbourOpacity(scroll - i);
                    self._faded.add(ws);
                    self._dress(ws);
                });
                return r;
            });
        } else {
            console.warn(`${LOG} WorkspacesView._updateWorkspacesState not found; the neighbouring Spaces peek in`);
        }
        c.add(() => this._undressAll());
        if (Main.overview.visible)
            this._dressOverview();
    }

    /** The backdrop sits right under the overview's own actor, above anything else's. */
    _restack() {
        const og = Main.layoutManager.overviewGroup;
        const overview = Main.overview._overview;
        if (this._group?.get_parent() === og && overview?.get_parent() === og)
            og.set_child_below_sibling(this._group, overview);
    }

    _build() {
        this._dropWallpapers();
        Main.layoutManager.monitors.forEach((_m, i) => {
            this._managers.push(new Background.BackgroundManager({
                container: this._group, monitorIndex: i, vignette: false,
            }));
        });
    }

    _dropWallpapers() {
        for (const m of this._managers)
            m.destroy();
        this._managers = [];
    }

    /** Every workspace of the overview, on every monitor (the extra monitors' views too). */
    _dressOverview() {
        const walk = actor => {
            for (let child = actor.get_first_child(); child; child = child.get_next_sibling()) {
                if (child instanceof Workspace.Workspace)
                    this._dress(child);
                else
                    walk(child);
            }
        };
        walk(Main.layoutManager.overviewGroup);
    }

    /**
     * Dress a workspace's card down once (wallpaper hidden, no shadow) and follow its state
     * for the desktop's icons and widgets.
     */
    _dress(ws) {
        const bg = ws?._background;
        const group = bg?._backgroundGroup;
        if (!group || !(bg instanceof Workspace.WorkspaceBackground) || this._dressed.has(bg))
            return;
        const hide = child => {
            if (child instanceof Meta.BackgroundActor)
                child.opacity = 0;
        };
        for (let child = group.get_first_child(); child; child = child.get_next_sibling())
            hide(child);
        // A new wallpaper (the user changed it) is added to the group: hidden as well
        const added = group.connect('child-added', (_g, child) => hide(child));
        bg.set_style('box-shadow: none;');

        const adj = bg._stateAdjustment ?? ws.stateAdjustment;
        const follow = () => {
            const mirror = this._mirrorOf(group);
            if (mirror)
                mirror.opacity = desktopItemsOpacity(adj?.value ?? 1);
        };
        const stateId = adj?.connect('notify::value', follow) ?? 0;
        // The mirror comes in after the card (on 'showing'): fade it from the first frame
        const mirrorId = group.connect('child-added', follow);
        follow();

        const undo = () => {
            this._dressed.delete(bg);
            group.disconnect(added);
            group.disconnect(mirrorId);
            if (stateId)
                adj.disconnect(stateId);
            for (let child = group.get_first_child(); child; child = child.get_next_sibling()) {
                if (child instanceof Meta.BackgroundActor || child.name === MIRROR_NAME)
                    child.opacity = 255;
            }
            bg.set_style(null);
        };
        this._dressed.set(bg, undo);
        bg.connect('destroy', () => this._dressed.delete(bg));
        ws.connect('destroy', () => this._faded.delete(ws));
    }

    _mirrorOf(group) {
        for (let child = group.get_first_child(); child; child = child.get_next_sibling()) {
            if (child.name === MIRROR_NAME)
                return child;
        }
        return null;
    }

    _undressAll() {
        for (const undo of [...this._dressed.values()])
            undo();
        for (const ws of this._faded)
            ws.opacity = 255;
        this._faded.clear();
    }
}
