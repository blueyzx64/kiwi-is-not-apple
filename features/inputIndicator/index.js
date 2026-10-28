// SPDX-License-Identifier: GPL-3.0-or-later
// Text-cursor indicators (macOS Sonoma): a small glass badge at the text caret. The Caps Lock
// badge stays under the caret (and follows it) while Caps Lock is on; the input-source badge
// (and the optional Caps-Lock-off badge) fades out after BADGE_MS.
//
// Shell API (checked on 50; the same in 48-51):
// - the caret: lib/caret.js (the IBus panel service's set-cursor-location);
// - Caps Lock: the seat keymap's 'state-changed' and get_caps_lock_state() (as
//   ui/shellEntry.js CapsLockWarning does);
// - input sources: ui/status/keyboard.js getInputSourceManager() 'current-source-changed'.
// Without a caret (no IBus, or an app that never reports one) the badge goes by the pointer
// and fades out, since there is no text field for it to stay under.
//
// With "Caps Lock switches the input source" (capsSwitch.js, its own registry entry) a Caps
// Lock press may be a tap that switches sources and turns Caps Lock off again: the badge waits
// until that feature has decided.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { getInputSourceManager } from 'resource:///org/gnome/shell/ui/status/keyboard.js';

import * as A11y from '../../lib/a11y.js';
import { Caret } from '../../lib/caret.js';
import { Glass } from '../../lib/glass.js';
import { KiwiSettings } from '../../lib/settings.js';
import {
    BADGE_MS, CAPS_HOLD_MS, CapsWatch, badgeFor, badgeLifetime, contains, isSourceSwitch, placeBadge,
    readConfig,
} from './model.js';

const STYLES = ['caps-on', 'caps-off', 'source'];
const CAPS_ICON = 'icons/kiwi-caps-lock-symbolic.svg';
const SWITCH_DECIDE_MS = CAPS_HOLD_MS + 80;     // capsSwitch.js decides at CAPS_HOLD_MS

export class InputIndicator {
    constructor(ctx, cleanup) {
        this._ctx = ctx;
        this._cleanup = cleanup;
        this._badge = null;
        this._hideToken = 0;
        this._deferToken = 0;
        this._shown = null;     // badgeFor() result on screen, with its placement
    }

    enable() {
        const cleanup = this._cleanup;
        const ks = new KiwiSettings(this._ctx.settings);
        ks.attach(cleanup);
        this._config = readConfig(ks);
        ks.watch(['input-indicator', 'input-indicator-caps-lock', 'input-indicator-caps-off', 'input-indicator-source'], () => {
            this._config = readConfig(ks);
            if (this._shown && !badgeFor(this._eventOf(this._shown), this._config))
                this._hide();
        });

        this._caret = Caret.acquire(cleanup);
        this._caret.watch(cleanup, rect => this._onCaret(rect));

        const backend = global.stage.context?.get_backend?.() ?? Clutter.get_default_backend();
        this._keymap = backend.get_default_seat().get_keymap();
        this._caps = new CapsWatch(this._keymap.get_caps_lock_state());
        cleanup.connect(this._keymap, 'state-changed', () => {
            const on = this._caps.update(this._keymap.get_caps_lock_state());
            if (on !== null)
                this._onCaps(on);
        });

        const sources = getInputSourceManager();
        cleanup.connect(sources, 'current-source-changed', (manager, old) => {
            const now = manager.currentSource;
            if (isSourceSwitch(old?.id, now?.id))
                this._show({ type: 'source', source: now });
        });
    }

    disable() {
        // Everything is in the cleanup registry
        this._badge = null;
        this._shown = null;
        this._hideToken = this._deferToken = 0;
    }

    /** The badge on screen, or null (for tests and the harness). */
    get badge() {
        return this._shown && this._badge?.visible ? { ...this._shown, actor: this._badge } : null;
    }

    get _capsOn() {
        return !!this._keymap?.get_caps_lock_state();
    }

    // A Shell password field (polkit, keyring, Wi-Fi, mount dialogs) has its own Caps Lock cue:
    // the Shell's "Caps lock is on" line, or Kiwi's ⇪ inside the field (features/dialogs)
    get _inShellPasswordField() {
        const focus = global.stage.key_focus;
        return focus instanceof Clutter.Text && focus.password_char !== 0;
    }

    _eventOf(shown) {
        return shown.style === 'source' ? { type: 'source', source: { shortName: shown.text } }
            : { type: 'caps', on: shown.style === 'caps-on' };
    }

    _onCaps(on) {
        this._release('_deferToken');
        if (!on) {
            if (this._shown?.style === 'caps-on')
                this._hide();
            this._show({ type: 'caps', on: false });
            return;
        }
        // A tap may only be switching the input source: wait for capsSwitch.js to decide
        if (this._ctx.features.instance('caps-lock-switch')?.applies?.()) {
            this._deferToken = this._cleanup.timeout(SWITCH_DECIDE_MS, () => {
                this._deferToken = 0;
                if (this._capsOn)
                    this._show({ type: 'caps', on: true });
            }, { name: 'input-badge-caps-defer' });
            return;
        }
        this._show({ type: 'caps', on: true });
    }

    _onCaret(rect) {
        const shown = this._shown;
        if (shown?.style === 'caps-on' && this._badge?.visible && this._inShellPasswordField) {
            this._hide();
        } else if (shown?.style === 'caps-on' && this._badge?.visible) {
            // Follow the caret; a lost caret (another window) makes the badge fade out
            this._place();
            this._schedule(badgeLifetime('caps-on', !!rect));
        } else if (rect && this._capsOn && !shown && !this._deferToken) {
            // A text field took focus while Caps Lock is on
            this._show({ type: 'caps', on: true });
        }
    }

    _ensureBadge() {
        if (this._badge)
            return this._badge;
        const badge = this._cleanup.actor(new St.BoxLayout({
            style_class: 'kiwi-input-badge', visible: false, opacity: 0, reactive: false,
        }));
        // ⇪ is missing from many UI fonts: Kiwi's own symbolic icon draws it
        this._capsIcon = new St.Icon({
            gicon: Gio.FileIcon.new(this._ctx.extension.dir.resolve_relative_path(CAPS_ICON)),
            style_class: 'kiwi-input-badge-icon', y_align: Clutter.ActorAlign.CENTER,
        });
        this._label = new St.Label({ style_class: 'kiwi-input-badge-label', y_align: Clutter.ActorAlign.CENTER });
        badge.add_child(this._capsIcon);
        badge.add_child(this._label);
        // Above the windows and the panel, outside the input region: not chrome
        Main.layoutManager.uiGroup.add_child(badge);
        // Kiwi glass (a fill on the label itself); solid when glass is off
        const glass = Glass.attach(badge, {
            surface: 'overlays', role: 'content', radius: 7,
            isDark: () => St.Settings.get().color_scheme !== St.SystemColorScheme.PREFER_LIGHT,
        });
        this._cleanup.add(() => glass.destroy());
        badge.set_pivot_point(0, 0);
        this._badge = badge;
        return badge;
    }

    _show(event) {
        const content = badgeFor(event, this._config);
        if (!content || (event.type === 'caps' && this._inShellPasswordField))
            return;
        const badge = this._ensureBadge();
        for (const s of STYLES)
            badge.remove_style_class_name(`kiwi-input-badge-${s}`);
        badge.add_style_class_name(`kiwi-input-badge-${content.style}`);
        const caps = content.style !== 'source';
        this._capsIcon.visible = caps;
        this._label.visible = !caps;
        this._label.text = caps ? '' : content.text;
        A11y.name(badge, content.style === 'source' ? content.text
            : content.style === 'caps-on' ? this._ctx.gettext('Caps Lock on') : this._ctx.gettext('Caps Lock off'), A11y.Role.ALERT);

        this._shown = { ...content };
        this._place();

        const motion = this._ctx.motion;
        const wasVisible = badge.visible && badge.opacity > 0;
        badge.visible = true;
        badge.get_parent()?.set_child_above_sibling(badge, null);
        if (!wasVisible) {
            badge.set_scale(0.86, 0.86);
            motion.ease(badge, { scale_x: 1, scale_y: 1 }, { duration: 'short', curve: 'emphasized' }, this._cleanup);
        }
        motion.ease(badge, { opacity: 255 }, { duration: 'micro', curve: 'standard' }, this._cleanup);
        this._release('_hideToken');
        this._schedule(badgeLifetime(content.style, !!this._caret.rect));
    }

    /** Put the badge under the caret (or by the pointer); no animation, so it can follow typing. */
    _place() {
        const badge = this._badge;
        if (!badge || !this._shown)
            return;
        const [px, py] = global.get_pointer();
        const caret = this._caret.rect;
        const at = caret ?? { x: px, y: py };
        const area = Main.layoutManager.monitors.find(m => contains(m, at.x, at.y)) ?? Main.layoutManager.primaryMonitor;
        const [, natW] = badge.get_preferred_width(-1);
        const [, natH] = badge.get_preferred_height(natW);
        const pos = placeBadge({
            caret, pointer: { x: px, y: py }, size: { width: natW, height: natH },
            area: { x: area.x, y: area.y, width: area.width, height: area.height },
        });
        badge.set_position(pos.x, pos.y);
        Object.assign(this._shown, { anchor: pos.anchor, x: pos.x, y: pos.y });
    }

    _schedule(lifetime) {
        if (lifetime === 'persist') {
            this._release('_hideToken');
            return;
        }
        if (this._hideToken)
            return;
        this._hideToken = this._cleanup.timeout(BADGE_MS, () => {
            this._hideToken = 0;
            this._hide();
        }, { name: 'input-badge-hide' });
    }

    _release(field) {
        if (this[field])
            this._cleanup.release(this[field]);
        this[field] = 0;
    }

    _hide() {
        const badge = this._badge;
        this._release('_hideToken');
        if (!badge)
            return;
        const was = this._shown?.style;
        this._ctx.motion.ease(badge, { opacity: 0 }, {
            duration: 'short', curve: 'exit',
            onDone: finished => {
                if (!finished)
                    return;
                badge.visible = false;
                this._shown = null;
                // The input-source badge covered the Caps Lock badge for a moment
                if (was === 'source' && this._capsOn && this._caret.rect)
                    this._show({ type: 'caps', on: true });
            },
        }, this._cleanup);
    }
}
