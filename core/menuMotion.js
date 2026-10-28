// SPDX-License-Identifier: GPL-3.0-or-later
// Popup menu timing, macOS style (motionModel.menuMotion): menus fade in quickly with no slide,
// a dismissal is immediate, and only a close after choosing an item fades out briefly. One
// place for every PopupMenu on the Shell's BoxPointer: Kiwi's panel menus, the Control Center
// (Quick Settings), the calendar, context menus.
//
// Stock GNOME animates every open and close for 150 ms with a slide and a scale; a dismissed
// menu lingered (input muted) under the next click, and a menu closed by another surface (the
// Notification Center replacing the calendar card) visibly slid away while the new one came in.
//
// Shell API (48-51): BoxPointer.open(animate, onComplete) / close(animate, onComplete) with
// PopupAnimation bits; both call this.ease() once with POPUP_ANIMATION_TIME, which we shorten
// by shadowing ease() on the instance for that one call. PopupMenuBase.itemActivated(animate)
// closes the top menu after an item is chosen. A non-numeric `animate` (a future params object)
// is passed through untouched.

import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { menuMotion } from './motionModel.js';

/**
 * @param {import('../lib/disposables.js').CleanupRegistry} cleanup undoes the injections
 * @param {{duration: (request: object) => number}} motion core/motion (animations off, reduced motion)
 */
export function installMenuMotion(cleanup, motion) {
    let activating = 0;

    const run = (phase, self, orig, animate, onComplete) => {
        if (typeof animate !== 'number' && typeof animate !== 'boolean')
            return orig.call(self, animate, onComplete);
        const plan = menuMotion(phase, animate, activating > 0);
        const ms = plan.flags ? motion.duration({ duration: plan.duration, curve: 'enter' }) : 0;
        if (!ms)
            return orig.call(self, BoxPointer.PopupAnimation.NONE, onComplete);
        // The original eases once; give that ease our duration
        self.ease = params => Object.getPrototypeOf(self).ease.call(self, { ...params, duration: ms });
        try {
            return orig.call(self, plan.flags, onComplete);
        } finally {
            delete self.ease;
        }
    };

    const proto = BoxPointer.BoxPointer.prototype;
    cleanup.inject(proto, 'open', function (orig, animate, onComplete) {
        return run('open', this, orig, animate, onComplete);
    });
    cleanup.inject(proto, 'close', function (orig, animate, onComplete) {
        return run('close', this, orig, animate, onComplete);
    });
    cleanup.inject(PopupMenu.PopupMenuBase.prototype, 'itemActivated', function (orig, ...args) {
        activating++;
        try {
            return orig.apply(this, args);
        } finally {
            activating--;
        }
    });
}
