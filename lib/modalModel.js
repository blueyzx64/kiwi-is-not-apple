// SPDX-License-Identifier: GPL-3.0-or-later
// Pure arbitration for Kiwi modals: only one is open at a time, and other Kiwi
// overlays that are not ModalSurfaces (the Downloads fan) get closed first.
// No gi imports, so it runs under plain `gjs -m` (tests/modalModel.test.js).

const LOG = '[Kiwi]';

export class ModalArbiter {
    constructor() {
        this._open = null;          // {id, close}
        this._foreign = new Map();  // id -> close fn
    }

    /** id of the open modal, or null. */
    get current() {
        return this._open?.id ?? null;
    }

    /**
     * Another Kiwi overlay that owns its own grab. close() runs whenever a modal is requested.
     *
     * @param {string} id unique name
     * @param {Function} close closes the overlay; must be safe when it is already closed
     * @returns {Function} unregister
     */
    registerForeign(id, close) {
        this._foreign.set(id, close);
        return () => {
            if (this._foreign.get(id) === close)
                this._foreign.delete(id);
        };
    }

    /**
     * A modal wants to open. Closes every foreign overlay and any other open modal.
     *
     * @param {string} id the modal asking
     * @returns {boolean} false when this id is already the open one (toggle: caller closes it)
     */
    request(id) {
        if (this._open?.id === id)
            return false;
        this.closeForeign();
        this._closeOpen();
        return true;
    }

    /** The modal finished opening. */
    opened(id, close) {
        this._open = { id, close };
    }

    /** The modal finished closing (idempotent; ignores a stale id). */
    closed(id) {
        if (this._open?.id === id)
            this._open = null;
    }

    closeForeign() {
        for (const [id, close] of [...this._foreign]) {
            try {
                close();
            } catch (e) {
                console.warn(`${LOG} closing ${id} failed: ${e.message}`);
            }
        }
    }

    /** Close the open modal and all foreign overlays. */
    closeAll() {
        this.closeForeign();
        this._closeOpen();
    }

    _closeOpen() {
        const cur = this._open;
        if (!cur)
            return;
        this._open = null;
        try {
            cur.close();
        } catch (e) {
            console.warn(`${LOG} closing modal ${cur.id} failed: ${e.message}`);
        }
    }
}
