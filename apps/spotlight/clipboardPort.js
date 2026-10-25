// SPDX-License-Identifier: GPL-3.0-or-later
// The seam between Spotlight and the clipboard feature (S4). Spotlight never imports the
// clipboard app; the clipboard app hands over a source while it is enabled and takes it back on
// disable. With no source (clipboard feature off) Spotlight shows no clipboard rows.
//
// source: {
//   items(): entry[]         newest first; S4's History entries:
//                            {id, kind:'text'|'image', type, text?, preview?, app, time, pinned}
//   copy(entry): void        put the entry on the clipboard (never pastes into a window)
// }

let current = null;
const listeners = new Set();

export const ClipboardPort = {
    /**
     * @param {object} cleanup CleanupRegistry of the provider; the source is dropped on dispose
     * @param {object} source see above
     */
    provide(cleanup, source) {
        current = source;
        listeners.forEach(fn => fn(source));
        cleanup.add(() => {
            if (current === source) {
                current = null;
                listeners.forEach(fn => fn(null));
            }
        });
    },

    get source() {
        return current;
    },

    /** Called now-and-later is not needed: Spotlight reads `source` when it opens. */
    onChange(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
    },
};
