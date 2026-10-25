// SPDX-License-Identifier: GPL-3.0-or-later
// The Now Playing tile: art, title, artist, play/pause and next for one MPRIS player.
// Players come from apps/mediaPlayback.js (Kiwi's MPRIS source). It is imported on demand,
// so a problem there costs the tile and nothing else.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';

import { Glass } from '../../lib/glass.js';

const ART_SIZE = 48;
const FADE_MS = 150;

export class NowPlaying {
    constructor({ gettext, cleanup }) {
        this._gettext = gettext;
        this._cleanup = cleanup;
        this._source = null;
        this._players = [];
        this._tokens = new Map();   // player -> token of its 'changed' handler
        this._destroyed = false;

        this.actor = new St.BoxLayout({
            style_class: 'quick-toggle button kiwi-cc-now-playing',
            visible: false,
            x_expand: true,
        });
        this._art = new St.Icon({
            style_class: 'kiwi-cc-np-art',
            icon_size: ART_SIZE,
            icon_name: 'audio-x-generic-symbolic',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._title = new St.Label({ style_class: 'kiwi-cc-np-title' });
        this._artist = new St.Label({ style_class: 'kiwi-cc-np-artist' });
        const text = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        text.add_child(this._title);
        text.add_child(this._artist);
        this._playPause = this._button('media-playback-start-symbolic', gettext('Play or pause'),
            () => this._current()?.playPause());
        this._next = this._button('media-skip-forward-symbolic', gettext('Next track'),
            () => this._current()?.next());
        for (const child of [this._art, text, this._playPause, this._next])
            this.actor.add_child(child);
    }

    _button(iconName, name, onClick) {
        const button = new St.Button({
            style_class: 'kiwi-cc-np-button',
            accessible_name: name,
            can_focus: true,
            child: new St.Icon({ icon_name: iconName }),
            y_align: Clutter.ActorAlign.CENTER,
        });
        button.connect('clicked', onClick);
        return button;
    }

    async start() {
        let module;
        try {
            module = await import('../mediaPlayback.js');
        } catch (e) {
            console.error('[Kiwi] Control Center: Now Playing unavailable:', e);
            return;
        }
        if (this._destroyed)
            return;

        this._source = new module.Source(this._gettext);
        this._source.connect('player-added', (_s, player) => this._add(player));
        this._source.connect('player-removed', (_s, player) => this._remove(player));
        this._source.start();
    }

    _add(player) {
        if (this._players.includes(player))
            return;
        this._players.push(player);
        this._tokens.set(player, player.connect('changed', () => this._update()));
        this._update();
    }

    _remove(player) {
        const token = this._tokens.get(player);
        if (token !== undefined)
            player.disconnect(token);
        this._tokens.delete(player);
        this._players = this._players.filter(p => p !== player);
        this._update();
    }

    _current() {
        return this._players.find(p => p.isPlaying()) ?? this._players.at(-1) ?? null;
    }

    _update() {
        const player = this._current();
        const show = !!player;
        if (show) {
            this._title.text = player.trackTitle ?? '';
            this._artist.text = (player.trackArtists ?? []).join(', ');
            this._art.gicon = this._artIcon(player);
            this._playPause.child.icon_name = player.isPlaying()
                ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic';
            this._next.reactive = player.canGoNext;
        }
        this._show(show);
    }

    _artIcon(player) {
        const url = player.trackCoverUrl;
        if (url?.startsWith('file://'))
            return new Gio.FileIcon({ file: Gio.File.new_for_uri(url) });
        return player.app?.get_icon() ?? new Gio.ThemedIcon({ name: 'audio-x-generic-symbolic' });
    }

    _show(show) {
        if (this.actor.visible === show)
            return;
        this.actor.remove_all_transitions();
        this.actor.visible = show;
        if (!show || !Glass.motion) {
            this.actor.opacity = 255;
            return;
        }
        this.actor.opacity = 0;
        this.actor.ease({ opacity: 255, duration: FADE_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
    }

    destroy() {
        this._destroyed = true;
        for (const [player, token] of this._tokens)
            player.disconnect(token);
        this._tokens.clear();
        this._players = [];
        this._source?.destroy();
        this._source = null;
        this.actor.destroy();
    }
}
