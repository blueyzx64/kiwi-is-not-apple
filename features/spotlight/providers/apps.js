// SPDX-License-Identifier: GPL-3.0-or-later
// Applications: Shell.AppSystem + Shell.AppUsage. The index is built once, lazily, and rebuilt
// when apps are installed or removed, so a keystroke only scores a few hundred short strings.

import Shell from 'gi://Shell';

import { DesktopAppInfo } from '../../../lib/compat.js';
import { rank, usageBoost } from '../model.js';

const MAX_RESULTS = 12;

export class AppsProvider {
    /**
     * @param {object} cleanup CleanupRegistry
     * @param {{hiddenIds?: string[]}} [opts] desktop ids never shown (Kiwi's synthetic Launchpad app)
     */
    constructor(cleanup, opts = {}) {
        this._system = Shell.AppSystem.get_default();
        this._usage = Shell.AppUsage.get_default();
        this._hidden = new Set(opts.hiddenIds ?? []);
        this._index = null;
        cleanup.connect(this._system, 'installed-changed', () => (this._index = null));
        cleanup.add(() => (this._index = null));
    }

    _build() {
        const records = [];
        for (const info of this._system.get_installed()) {
            const id = info.get_id();
            if (!id || this._hidden.has(id) || !info.should_show())
                continue;
            const desktop = info instanceof DesktopAppInfo ? info : null;
            records.push({
                id: `app:${id}`,
                kind: 'app',
                appId: id,
                title: info.get_display_name() || info.get_name(),
                subtitle: desktop?.get_generic_name() ?? '',
                keywords: [id.replace(/\.desktop$/, ''), ...(desktop?.get_keywords() ?? [])],
                gicon: info.get_icon(),
            });
        }
        this._index = records;
        return records;
    }

    /** Build the index now (call from an idle after enable). */
    warm() {
        this._index ??= this._build();
    }

    _usageOrder() {
        const order = new Map();
        this._usage.get_most_used().forEach((app, i) => order.set(app.get_id(), i));
        return order;
    }

    /** Ranked app rows for a query (sync, in-memory). */
    searchSync(query) {
        const records = this._index ?? this._build();
        const order = this._usageOrder();
        const boosted = records.map(r => ({ ...r, boost: usageBoost(order.get(r.appId) ?? -1) }));
        return rank(boosted, query, MAX_RESULTS);
    }

    /** Most used apps, for the empty-query suggestions. */
    recent(limit = 6) {
        const records = this._index ?? this._build();
        const byId = new Map(records.map(r => [r.appId, r]));
        const out = [];
        for (const app of this._usage.get_most_used()) {
            const rec = byId.get(app.get_id());
            if (rec)
                out.push({ ...rec });
            if (out.length >= limit)
                break;
        }
        return out;
    }

    /** Open or focus the app. */
    activate(item) {
        const app = this._system.lookup_app(item.appId);
        if (!app) {
            console.warn(`[Kiwi] spotlight: app ${item.appId} is gone`);
            return false;
        }
        app.activate();
        return true;
    }
}
