// SPDX-License-Identifier: GPL-3.0-or-later
// GlassService: the one blur + tint + highlight implementation (see .swarm/agents/S3.md FREEZE).
// SKELETON: API frozen, internals land in the next commits.

class GlassHandle {
    constructor(service, entry) {
        this._service = service;
        this._entry = entry;
        this._dead = false;
    }

    get tier() { return 'off'; }
    get params() { return null; }
    setVisible(_visible) {}
    setRect(_x, _y, _w, _h) {}
    invalidate() {}
    destroy() { this._dead = true; }
}

class GlassService {
    configure(_settings) {}
    wants(_surface) { return false; }
    get motion() { return true; }
    watch(_registry, _fn) {}
    attach(target, opts = {}) { return new GlassHandle(this, { target, opts }); }
}

export const Glass = new GlassService();
