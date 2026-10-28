// SPDX-License-Identifier: GPL-3.0-or-later
// Clock data: the local time, ticking on the whole minute, and the world clocks the user keeps
// in GNOME Clocks (org.gnome.shell.world-clocks, the list the Shell's date menu shows). With no
// city there, World Clock shows macOS's own (data.js DEFAULT_WORLD_CLOCKS), as on a new Mac.
//
// Shell API: GWeather 4 (Location.get_world().deserialize, as js/ui/dateMenu.js does).

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GWeather from 'gi://GWeather?version=4.0';

import { fallbackClocks, msToNextMinute } from '../data.js';
import { Provider } from './base.js';

const WORLD_CLOCKS = 'org.gnome.shell.world-clocks';
const INTERFACE = 'org.gnome.desktop.interface';

const settingsOrNull = id =>
    Gio.SettingsSchemaSource.get_default()?.lookup(id, true) ? new Gio.Settings({ schema_id: id }) : null;

export class TimeProvider extends Provider {
    initial() {
        return { now: GLib.DateTime.new_now_local(), clocks: [], twelveHour: false };
    }

    run(cleanup) {
        const iface = settingsOrNull(INTERFACE);
        const world = settingsOrNull(WORLD_CLOCKS);
        this._iface = iface;
        this._clocks = [];
        if (iface)
            cleanup.connect(iface, 'changed::clock-format', () => this._tick());
        if (world)
            cleanup.connect(world, 'changed::locations', () => this._readClocks(world));
        this._readClocks(world);
        cleanup.add(() => {
            this._iface = null;
            this._clocks = [];
        });
        this._schedule(cleanup);
        this._tick();
    }

    _readClocks(world) {
        const out = [];
        const saved = world?.get_value('locations').deepUnpack() ?? [];
        const gw = saved.length ? GWeather.Location.get_world() : null;
        for (const v of saved) {
            const loc = gw?.deserialize(v);
            const tz = loc?.get_timezone();
            if (tz)
                out.push({ name: loc.get_city_name() || loc.get_name(), tz });
        }
        if (!out.length) {
            const _ = this._env.gettext;
            const local = GLib.TimeZone.new_local().get_identifier();
            for (const c of fallbackClocks(local)) {
                const tz = GLib.TimeZone.new_identifier(c.tz);
                if (tz)
                    out.push({ name: _(c.name), tz });
            }
        }
        this._clocks = out;
        this._tick();
    }

    // One timeout to the next whole minute, then the next one from there (no drift)
    _schedule(cleanup) {
        const now = GLib.DateTime.new_now_local();
        cleanup.timeout(msToNextMinute(now.get_second(), Math.floor(now.get_microsecond() / 1000)), () => {
            this._tick();
            if (this.running)
                this._schedule(cleanup);
        }, { name: 'kiwi-widgets-clock' });
    }

    _tick() {
        const now = GLib.DateTime.new_now_local();
        this.publish({
            now,
            twelveHour: this._iface?.get_string('clock-format') === '12h',
            clocks: this._clocks.map(c => ({ name: c.name, time: now.to_timezone(c.tz) })),
        });
    }
}
