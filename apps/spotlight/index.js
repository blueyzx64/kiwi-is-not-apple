// SPDX-License-Identifier: GPL-3.0-or-later
// Spotlight: a centred glass search bar. A Super tap opens it (it takes over the Shell's
// overlay-key from the Activities overview), and an optional extra shortcut opens it too.
//
// Layers:
//   model.js, calculator.js, providerInfo.js   pure, unit-tested
//   providers/*.js                             adapters to Shell, Gio and D-Bus
//   view.js                                    St widgets inside lib/modalSurface.js
//   index.js (this file)                       wiring: settings, shortcuts, search flow, actions
//
// It does not route through Main.overview search, so skipOverviewOnLogin and
// focusOnOverviewExit never see it.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Keybindings, MODAL_MODES } from '../../lib/keybindings.js';
import { KiwiSettings } from '../../lib/settings.js';
import { ModalSurface } from '../../lib/modalSurface.js';

import { evaluateQuery } from './calculator.js';
import {
    SearchSession, buildEmptySections, buildSections, looksLikeUrl, webSearchUrl,
} from './model.js';
import { OverlayKeyTakeover } from './overlayKey.js';
import { AppsProvider } from './providers/apps.js';
import { ClipboardProvider } from './providers/clipboard.js';
import { DBusSearch } from './providers/dbusSearch.js';
import { SettingsProvider } from './providers/settings.js';
import { SpotlightView } from './view.js';

const LOG = '[Kiwi] spotlight:';
const LAUNCHPAD_DESKTOP_ID = 'org.gnome.Shell.Extensions.Kiwi.Launchpad.desktop';
const EXTERNAL_DEBOUNCE_MS = 80;
const WIDTH = 680;
const OFFSET_TOP = 140;
const RADIUS = 22;

export class SpotlightFeature {
    constructor(ctx, cleanup) {
        this._ctx = ctx;
        this._cleanup = cleanup;
        this._view = null;
        this._query = '';
        this._local = {};
        this._session = null;
        this._debounce = 0;
        this._externalReady = false;
        this._enabled = false;
        this._loadCancellable = null;
    }

    enable() {
        const { settings, gettext } = this._ctx;
        const cleanup = this._cleanup;
        this._enabled = true;
        cleanup.add(() => (this._enabled = false));
        this._loadCancellable = new Gio.Cancellable();
        cleanup.add(() => {
            this._loadCancellable.cancel();
            this._loadCancellable = null;
        });
        const ks = new KiwiSettings(settings);
        ks.attach(cleanup);
        this._ks = ks;
        this._ = gettext;

        this._apps = new AppsProvider(cleanup, { hiddenIds: [LAUNCHPAD_DESKTOP_ID] });
        this._settingsProvider = new SettingsProvider(this._ctx);
        this._clipboard = new ClipboardProvider(gettext);
        this._dbus = new DBusSearch();
        cleanup.add(() => this._dbus.reset());
        // Warm the app index after the Shell is idle, so the first keystroke is fast
        cleanup.idle(() => this._apps.warm(), { name: 'spotlight-warm' });

        this._modal = new ModalSurface(cleanup, {
            id: 'spotlight',
            width: WIDTH,
            position: 'top',
            offsetTop: OFFSET_TOP,
            radius: RADIUS,
            styleClass: 'kiwi-spotlight',
            build: frame => this._build(frame),
            onClosed: () => this._closed(),
        });
        cleanup.add(() => this._closed());

        // The extension is torn down on lock, but close at once on any lock transition too
        cleanup.connect(Main.sessionMode, 'updated', () => {
            if (Main.sessionMode.isLocked)
                this._modal.close({ immediate: true });
        });

        // A Super tap: take over overlay-key while the key is on; give it back when it goes off
        const takeover = new OverlayKeyTakeover(() => this.toggle());
        this._takeover = takeover;
        cleanup.add(() => {
            takeover.stop();
            this._takeover = null;
        });
        const applySuper = () => {
            if (ks.bool('spotlight-on-super'))
                takeover.start();
            else
                takeover.stop();
        };
        applySuper();
        ks.watch(['spotlight-on-super'], applySuper);

        // Optional extra shortcut (empty by default). Registered always; an empty list binds nothing.
        if (ks.has('spotlight-shortcut'))
            Keybindings.add(cleanup, 'spotlight-shortcut', settings, () => this.toggle(), { modes: MODAL_MODES });
    }

    disable() {
        // Everything is in the cleanup registry, which is disposed right after this returns.
        this._modal?.close({ immediate: true });
    }

    toggle() {
        this._modal?.toggle();
    }

    // ---- modal lifecycle

    _build(frame) {
        this._view = new SpotlightView({
            gettext: this._,
            onQuery: text => this._search(text),
            onActivate: (item, opts) => this._activate(item, opts),
            onCopy: item => this._copy(item),
            onClose: () => this._modal.close(),
        });
        const focus = this._view.build(frame);
        // A second Super tap closes it (overlay-key is filtered in the modal's POPUP mode otherwise)
        this._takeover?.allowInModal();
        this._settingsProvider.invalidate();
        this._search('');
        return focus;
    }

    _closed() {
        this._takeover?.restoreModes();
        this._cancelSearch();
        this._view?.destroy();
        this._view = null;
        this._query = '';
        this._local = {};
    }

    _cancelSearch() {
        if (this._debounce) {
            this._cleanup.release(this._debounce);
            this._debounce = 0;
        }
        this._session?.cancel();
        this._session = null;
    }

    // ---- search

    _search(text) {
        const q = text.trim();
        this._query = q;
        this._cancelSearch();
        if (!q) {
            this._local = {};
            this._view.setSections(this._emptySections());
            return;
        }

        // Local providers answer at once, in memory
        const ks = this._ks;
        const local = {
            apps: this._apps.searchSync(q),
            settings: ks.bool('spotlight-settings') ? this._settingsProvider.searchSync(q) : [],
            clipboard: ks.bool('spotlight-clipboard') ? this._clipboard.searchSync(q) : [],
            calculator: [],
            web: [],
        };
        if (ks.bool('spotlight-calculator')) {
            const result = evaluateQuery(q);
            if (result) {
                local.calculator = [{
                    id: 'calc', kind: 'calc', title: result.text, subtitle: `${result.expression} =`,
                    iconName: 'accessories-calculator-symbolic', score: 1000, copyText: result.text,
                }];
            }
        }
        if (ks.bool('spotlight-web')) {
            if (looksLikeUrl(q)) {
                const url = /^https?:\/\//i.test(q) ? q : `https://${q}`;
                local.web.push({
                    id: 'web-open', kind: 'web', title: `${this._('Open')} ${q}`, subtitle: url,
                    iconName: 'web-browser-symbolic', score: 0, url,
                });
            }
            const url = webSearchUrl(ks.string('spotlight-engine'), q);
            if (url) {
                local.web.push({
                    id: 'web-search', kind: 'web', title: `${this._('Search the web for')} “${q}”`,
                    subtitle: this._('Web'), iconName: 'system-search-symbolic', score: 0, url,
                });
            }
        }
        this._local = local;
        this._render();

        // Providers that talk to other processes stream in after a short debounce
        this._debounce = this._cleanup.timeout(EXTERNAL_DEBOUNCE_MS, () => {
            this._debounce = 0;
            this._startExternal(q);
            return GLib.SOURCE_REMOVE;
        }, { name: 'spotlight-debounce' });
    }

    async _startExternal(q) {
        if (!this._externalReady) {
            try {
                await this._dbus.load(this._loadCancellable);
                this._externalReady = true;
            } catch (e) {
                if (this._enabled)
                    console.warn(`${LOG} could not read search providers: ${e.message}`);
                return;
            }
            if (!this._enabled || this._query !== q || !this._view)
                return;
        }
        const providers = this._dbus.sessionProviders({ files: this._ks.bool('spotlight-files') });
        if (providers.length === 0)
            return;
        this._session = new SearchSession({
            providers,
            schedule: (ms, fn) => {
                const token = this._cleanup.timeout(ms, () => {
                    fn();
                    return GLib.SOURCE_REMOVE;
                }, { name: 'spotlight-provider-timeout' });
                return () => this._cleanup.release(token);
            },
            makeCancellable: () => new Gio.Cancellable(),
            onUpdate: () => this._render(),
            onError: (id, e) => {
                if (e.message !== 'timeout')
                    console.debug(`${LOG} provider ${id}: ${e.message}`);
            },
        });
        this._session.start(q);
    }

    _emptySections() {
        const ks = this._ks;
        // Privacy: copied text shows on an empty search only when the user asked for it
        const clips = ks.bool('spotlight-clipboard') && ks.bool('spotlight-recent-clipboard')
            ? this._clipboard.recent(4) : [];
        return buildEmptySections(this._apps.recent(6), clips);
    }

    _render() {
        if (!this._view || !this._query)
            return;
        const external = this._session?.byGroup(this._query) ?? {};
        const byGroup = { ...this._local };
        for (const [group, items] of Object.entries(external))
            byGroup[group] = [...(byGroup[group] ?? []), ...items].sort((a, b) => b.score - a.score);
        this._view.setSections(buildSections(byGroup, { limits: { web: 2 } }));
    }

    // ---- actions

    _copy(item) {
        const text = item.copyText ?? item.clipboardText ?? (item.kind === 'clipboard' ? null : item.title);
        if (item.kind === 'clipboard')
            this._clipboard.activate(item);
        else if (text)
            St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, text);
        this._modal.close();
    }

    _activate(item, { reveal = false } = {}) {
        // Close first so the grab is gone and focus is back before another app takes it
        this._modal.close();
        try {
            switch (item.kind) {
            case 'app':
                this._apps.activate(item);
                break;
            case 'setting':
            case 'action':
                this._settingsProvider.activate(item);
                break;
            case 'clipboard':
                this._clipboard.activate(item);
                break;
            case 'calc':
                St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, item.copyText);
                break;
            case 'web':
                this._openUri(item.url);
                break;
            case 'file':
            case 'external':
                if (reveal && item.kind === 'file')
                    this._reveal(item);
                else
                    this._dbus.activate(item, global.get_current_time()).catch(e => {
                        if (this._enabled)
                            console.warn(`${LOG} activate failed: ${e.message}`);
                    });
                break;
            default:
                break;
            }
        } catch (e) {
            console.warn(`${LOG} activating ${item.id} failed: ${e.message}`);
        }
    }

    _openUri(uri) {
        if (!/^https?:\/\//i.test(uri ?? ''))
            return;
        Gio.AppInfo.launch_default_for_uri_async(uri, global.create_app_launch_context(0, -1), null, (_o, res) => {
            try {
                Gio.AppInfo.launch_default_for_uri_finish(res);
            } catch (e) {
                console.warn(`${LOG} open failed: ${e.message}`);
            }
        });
    }

    /** Ctrl+Enter: show the file in Files (org.freedesktop.FileManager1.ShowItems). */
    _reveal(item) {
        const uri = item.source?.resultId;
        if (!uri?.startsWith('file://'))
            return;
        Gio.DBus.session.call('org.freedesktop.FileManager1', '/org/freedesktop/FileManager1',
            'org.freedesktop.FileManager1', 'ShowItems', new GLib.Variant('(ass)', [[uri], '']),
            null, Gio.DBusCallFlags.NONE, 2000, null, (conn, res) => {
                try {
                    conn.call_finish(res);
                } catch (e) {
                    // No file manager service: open the item itself instead
                    if (!this._enabled)
                        return;
                    this._dbus.activate(item, global.get_current_time()).catch(() => {});
                }
            });
    }
}
