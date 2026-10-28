// SPDX-License-Identifier: GPL-3.0-or-later
// The three tabs of the expanded notch, all on one 648x192 shape so switching never resizes:
//   Now      the media hero (or a large clock), then live activities and recent notifications
//   Tray     the file shelf, a drop target while files are dragged over the notch (and the
//            clipboard column when notch-show-clipboard is on)
//   Widgets  core/widgets cards side by side (notch-widgets: any kind, small or medium), and
//            the notch's own Controls tile (Focus, microphone, timers); Edit shows the chooser
// Builders only: no state. `env` carries gettext, the handlers and the 1 s refresh list:
//   {_, h, live: Function[], alive: () => boolean, clockFormat: () => string, host, views}

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';

import * as A11y from '../../lib/a11y.js';
import { label, icon, themed, button, artwork, artButton, track, column, setText, dismissButton } from './ui.js';
import { trackProgress, seekTarget, formatClock, NOTCH_CONTROLS, WIDGET_STRIP } from './dashboardModel.js';
import { buildChooser } from '../../core/widgets/chooser.js';
import { fitStrip, fitsStrip } from '../../core/widgets/model.js';
import { pixelSize } from '../../core/widgets/view.js';
export { DASH_SIZE } from './dashboardModel.js';
import { nowRows, presentation } from './model.js';
import { row as activityRow, iconWell } from './pills.js';
import { dragIconName } from '../../lib/dragHelperModel.js';

const WIDTH = Object.freeze({ hero: 340, list: 248, clipboard: 196, inner: 608 });
const SHELF_VISIBLE = 8;
const TIMER_PRESETS = [1, 5, 15];
const SEEK_STEP_S = 5;      // a Left / Right press on the scrubber
const N_ = s => s;         // marked for translation; the chooser translates it

function mediaColumn(env, media, width, live) {
    const col = column('kiwi-notch-media', width);
    let alive = true;
    col.connect('destroy', () => {
        alive = false;
    });

    // Art, title and artist, the app icon in the top-right corner
    const top = new St.BoxLayout({ style_class: 'kiwi-notch-media-top' });
    top.add_child(artButton(artwork(media, 68, 'kiwi-notch-artwork-large'), env._('Show the player'), env.h.onRaisePlayer));
    const text = new St.BoxLayout({
        style_class: 'kiwi-notch-media-text',
        orientation: Clutter.Orientation.VERTICAL,
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    });
    text.add_child(label(media.title || env._('Unknown title'), 'kiwi-notch-media-title'));
    if (media.artist)
        text.add_child(label(media.artist, 'kiwi-notch-media-artist kiwi-secondary-text'));
    top.add_child(text);
    if (media.appIcon) {
        top.add_child(new St.Icon({
            gicon: media.appIcon, icon_size: 16,
            style_class: 'kiwi-notch-media-app', y_align: Clutter.ActorAlign.START,
        }));
    }
    col.add_child(top);

    // The scrubber, when the player reports a length (and then a position)
    const hasLength = Number.isFinite(media.length) && media.length > 0;
    const scrub = new St.BoxLayout({ style_class: 'kiwi-notch-scrub', visible: hasLength, opacity: 0 });
    const elapsed = label('', 'kiwi-notch-scrub-time kiwi-secondary-text');
    const remaining = label('', 'kiwi-notch-scrub-time kiwi-notch-scrub-remaining kiwi-secondary-text');
    const bar = track('kiwi-notch-scrub-track', 'kiwi-notch-scrub-fill', 4, 0);
    // A click on the bar seeks there. It is a button so the press stays with it and does
    // not count as a click on the notch (which would close the dashboard).
    const seekable = hasLength && !!media.canSeek && !!env.h.onSeek;
    const hit = new St.Button({
        style_class: 'kiwi-notch-scrub-hit',
        child: bar,
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
        reactive: seekable,
        can_focus: seekable,
        accessible_name: env._('Seek'),
        accessible_role: A11y.Role.SLIDER,
    });
    let position = 0;       // the last fraction shown, the start of a keyboard step
    const seekTo = fraction => {
        if (seekTarget(fraction, media.length) === null)
            return;
        position = Math.max(0, Math.min(1, fraction));
        bar.kiwiSetFraction(position);
        env.h.onSeek(fraction);
    };
    hit.connect('clicked', () => {
        const [px] = global.get_pointer();
        const [tx] = bar.get_transformed_position();
        const [tw] = bar.get_transformed_size();
        if (tw > 0)
            seekTo((px - tx) / tw);
    });
    // Left and Right skip SEEK_STEP_S seconds, as a media player's slider does
    hit.connect('key-press-event', (_a, event) => {
        const sym = event.get_key_symbol();
        if (sym !== Clutter.KEY_Left && sym !== Clutter.KEY_Right)
            return Clutter.EVENT_PROPAGATE;
        const step = SEEK_STEP_S / media.length;
        seekTo(position + (sym === Clutter.KEY_Right ? step : -step));
        return Clutter.EVENT_STOP;
    });
    scrub.add_child(elapsed);
    scrub.add_child(hit);
    scrub.add_child(remaining);
    col.add_child(scrub);
    if (hasLength && env.h.getPosition) {
        live.push(() => {
            env.h.getPosition().then(position => {
                if (!alive || !env.alive())
                    return;
                const p = trackProgress(position, media.length);
                const shown = p ? 255 : 0;
                if (scrub.opacity !== shown)
                    scrub.opacity = shown;
                if (!p)
                    return;
                setText(elapsed, p.elapsed);
                setText(remaining, p.remaining);
                position = p.fraction;
                bar.kiwiSetFraction(p.fraction);
            }).catch(() => {});
        });
    }

    // Previous, play / pause, next
    const controls = new St.BoxLayout({
        style_class: 'kiwi-notch-controls', x_align: Clutter.ActorAlign.CENTER,
    });
    const control = (name, symbolic, command, enabled, size) => {
        const b = new St.Button({
            style_class: 'kiwi-notch-control',
            child: new St.Icon({ icon_name: symbolic, icon_size: size }),
            can_focus: enabled,
            reactive: enabled,
            opacity: enabled ? 255 : 90,
            accessible_name: name,
        });
        b.connect('clicked', () => env.h.onMedia(command));
        controls.add_child(b);
    };
    control(env._('Previous'), 'media-skip-backward-symbolic', 'previous', media.canPrevious, 20);
    control(media.playing ? env._('Pause') : env._('Play'),
        media.playing ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic',
        'toggle', true, 24);
    control(env._('Next'), 'media-skip-forward-symbolic', 'next', media.canNext, 20);
    col.add_child(controls);
    return col;
}

// Nothing is playing: a large clock and the date in place of the player
function clockColumn(env, width, live) {
    const col = column('kiwi-notch-clock', width);
    const row = new St.BoxLayout({ style_class: 'kiwi-notch-clock-row' });
    const time = new St.Label({ style_class: 'kiwi-notch-clock-time' });
    const suffix = new St.Label({ style_class: 'kiwi-notch-clock-suffix kiwi-secondary-text', y_align: Clutter.ActorAlign.END });
    row.add_child(time);
    row.add_child(suffix);
    col.add_child(row);
    const day = label('', 'kiwi-notch-clock-date kiwi-secondary-text');
    col.add_child(day);
    live.push(() => {
        const now = GLib.DateTime.new_now_local();
        const c = formatClock(now.get_hour(), now.get_minute(), env.clockFormat());
        setText(time, c.time);
        setText(suffix, c.suffix);
        suffix.visible = !!c.suffix;
        setText(day, now.format('%A, %e %B').replace(/\s+/g, ' '));
    });
    return col;
}

// Recent notifications (and an "N more" line) for the Now tab's right column
function listColumn(env, ctx) {
    const col = new St.BoxLayout({ orientation: Clutter.Orientation.VERTICAL, x_expand: true });
    const recent = ctx.recent ?? [];
    if (!recent.length && ctx.empty) {
        col.add_child(label(env._('No notifications'), 'kiwi-notch-empty-text kiwi-notch-list-empty kiwi-secondary-text', {
            x_align: Clutter.ActorAlign.CENTER,
        }));
    }
    for (const item of recent) {
        const b = new St.Button({
            style_class: 'kiwi-notch-card-row kiwi-notch-recent kiwi-row',
            can_focus: true,
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            accessible_name: item.title,
        });
        const row = new St.BoxLayout({ style_class: 'kiwi-notch-recent-row', x_expand: true });
        row.add_child(iconWell(item.gicon ?? themed('dialog-information-symbolic'), presentation('notification'), 'row'));
        const text = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL, x_expand: true, y_align: Clutter.ActorAlign.CENTER,
        });
        const line = new St.BoxLayout({ style_class: 'kiwi-notch-recent-line' });
        line.add_child(label(item.title, 'kiwi-notch-recent-title', { x_expand: true }));
        if (item.when)
            line.add_child(label(item.when, 'kiwi-notch-recent-time kiwi-secondary-text'));
        text.add_child(line);
        const body = (item.body ?? '').replace(/\s+/g, ' ').trim();
        if (body || item.app) {
            const sub = label('', 'kiwi-notch-recent-sub kiwi-secondary-text');
            // Like the card: the body may carry markup (Rhythmbox sends
            // "by <i>Artist</i>"); fixMarkup keeps the allowed tags and escapes the rest.
            try {
                sub.clutter_text.set_markup(body
                    ? Util.fixMarkup(body, !!item.markup)
                    : Util.fixMarkup(item.app, false));
            } catch (_e) {
                sub.text = body || item.app;
            }
            text.add_child(sub);
        }
        row.add_child(text);
        // The × takes it out of the message list (as the stock list's close button does), so
        // it does not come back on the next refresh
        if (env.h.onDismissNotification) {
            row.add_child(dismissButton(env._('Dismiss'),
                () => env.h.onDismissNotification(item.notification), b));
        }
        b.set_child(row);
        b.connect('clicked', () => env.h.onOpenNotification?.(item.notification));
        col.add_child(b);
    }
    const more = ctx.more ?? 0;
    if (more > 0) {
        const b = new St.Button({
            style_class: 'kiwi-notch-more',
            label: env._('%d more').format(more),
            can_focus: true,
            x_align: Clutter.ActorAlign.START,
        });
        b.connect('clicked', () => env.h.onOpenList?.());
        col.add_child(b);
    }
    return col;
}

// Clipboard history (null while the clipboard feature or its notch option is off)
function clipboardColumn(env, entries, width) {
    const col = column('kiwi-notch-clipboard', width);
    col.add_child(label(env._('Clipboard'), 'kiwi-notch-caption kiwi-section-header'));
    if (!entries.length)
        col.add_child(label(env._('Nothing copied yet'), 'kiwi-notch-empty-text kiwi-secondary-text'));
    for (const entry of entries) {
        const b = new St.Button({
            style_class: 'kiwi-notch-clip kiwi-row',
            accessible_name: entry.text,
            can_focus: true,
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            child: label(entry.text, 'kiwi-notch-clip-text'),
        });
        b.connect('clicked', () => env.h.onCopy(entry.id));
        col.add_child(b);
    }
    return col;
}

// ---- Now -------------------------------------------------------------------------------

/**
 * @param {object} env
 * @param {{media, activities: object[], recent: object[], count: number}} ctx
 */
export function nowTab(env, ctx) {
    const body = new St.BoxLayout({ style_class: 'kiwi-notch-tab-body kiwi-notch-tab-now', x_expand: true, y_expand: true });
    // Both columns sit in the middle of the body's height, so a short one (the clock, one or
    // two notifications) is balanced against the other instead of hugging the top
    const hero = ctx.media ? mediaColumn(env, ctx.media, WIDTH.hero, env.live) : clockColumn(env, WIDTH.hero, env.live);
    hero.y_align = Clutter.ActorAlign.CENTER;
    body.add_child(hero);

    const col = column('kiwi-notch-list', WIDTH.list);
    col.y_align = Clutter.ActorAlign.CENTER;
    const acts = (ctx.activities ?? []).filter(a => a.kind !== 'media' && a.kind !== 'media-paused');
    const recent = ctx.recent ?? [];
    const rows = nowRows(acts.length, Math.max(recent.length, ctx.count ?? 0));
    for (const a of acts.slice(0, rows.activities))
        col.add_child(activityRow(a, {
            _: env._, live: env.live, onAction: env.h.onActivityAction, onDismiss: env.h.onDismissActivity,
        }));
    const listed = recent.slice(0, rows.notifications);
    const more = Math.max(0, (ctx.count ?? recent.length) - listed.length);
    col.add_child(listColumn(env, { recent: listed, more: rows.activities + listed.length < 3 ? more : 0, empty: !acts.length }));
    body.add_child(col);
    return body;
}

// ---- Tray ------------------------------------------------------------------------------

/**
 * @param {object} env
 * @param {{shelf: {uris: string[], info: Function, clipboardHasFiles: boolean}, selected: string|null,
 *   clipboard: object[]|null}} ctx
 */
export function trayTab(env, ctx) {
    const body = new St.BoxLayout({ style_class: 'kiwi-notch-tab-body kiwi-notch-tab-tray', x_expand: true, y_expand: true });
    const width = ctx.clipboard ? WIDTH.inner - WIDTH.clipboard - 20 : WIDTH.inner;
    const shelf = column(`kiwi-notch-shelf${ctx.dropping ? ' kiwi-notch-shelf-dropping' : ''}`, width);
    const uris = ctx.shelf.uris;
    const selected = uris.includes(ctx.selected) ? ctx.selected : null;

    // Toolbar: what you can do with the selection, or how to add files
    const bar = new St.BoxLayout({ style_class: 'kiwi-notch-shelf-bar' });
    if (ctx.dropping) {
        bar.add_child(icon(themed('folder-download-symbolic'), 16, 'kiwi-notch-glyph kiwi-notch-tint-accent'));
        bar.add_child(label(env._('Drop to add to the Shelf'), 'kiwi-notch-shelf-selected', { x_expand: true }));
    } else if (selected) {
        const info = ctx.shelf.info(selected);
        bar.add_child(label(info.name, 'kiwi-notch-shelf-selected', { x_expand: true }));
        const act = (iconName, name, fn) => bar.add_child(button({
            styleClass: 'kiwi-notch-row-action kiwi-toolbar-button', iconName, accessibleName: name, size: 14, onClick: fn,
        }));
        act('document-open-symbolic', env._('Open'), () => env.h.onShelf('open', selected));
        act('folder-open-symbolic', env._('Show in Files'), () => env.h.onShelf('reveal', selected));
        act('edit-copy-symbolic', env._('Copy'), () => env.h.onShelf('copy', selected));
        act('list-remove-symbolic', env._('Remove from Shelf'), () => env.h.onShelf('remove', selected));
    } else {
        const add = button({
            styleClass: 'kiwi-notch-chip', iconName: 'list-add-symbolic', text: env._('Add from Clipboard'),
            accessibleName: env._('Add from Clipboard'), size: 12, onClick: () => env.h.onShelf('add-clipboard'),
        });
        add.reactive = ctx.shelf.clipboardHasFiles;
        add.opacity = add.reactive ? 255 : 110;
        bar.add_child(add);
        bar.add_child(new St.Widget({ x_expand: true }));
        if (uris.length) {
            bar.add_child(button({
                styleClass: 'kiwi-notch-chip', text: env._('Clear'), accessibleName: env._('Clear Shelf'),
                onClick: () => env.h.onShelf('clear'),
            }));
        }
    }
    shelf.add_child(bar);

    if (!uris.length) {
        const empty = new St.BoxLayout({ style_class: 'kiwi-notch-shelf-empty', orientation: Clutter.Orientation.VERTICAL, y_expand: true });
        empty.add_child(icon(themed('folder-download-symbolic'), 24, 'kiwi-notch-shelf-empty-icon'));
        empty.add_child(label(env._('Drop files here, or copy them and Add from Clipboard'),
            'kiwi-notch-empty-text kiwi-notch-shelf-hint kiwi-secondary-text', { x_align: Clutter.ActorAlign.CENTER }));
        shelf.add_child(empty);
    } else {
        const grid = new St.Widget({
            style_class: 'kiwi-notch-shelf-grid',
            layout_manager: new Clutter.GridLayout({ column_homogeneous: true, column_spacing: 8, row_spacing: 8 }),
            x_expand: true,
        });
        const perRow = 4;
        const tiles = [];
        uris.slice(0, SHELF_VISIBLE).forEach((uri, i) => {
            const info = ctx.shelf.info(uri);
            const tile = new St.Button({
                style_class: `kiwi-notch-shelf-tile${uri === selected ? ' kiwi-notch-shelf-tile-selected' : ''}${info.missing ? ' kiwi-notch-shelf-missing' : ''}`,
                can_focus: true,
                accessible_name: info.name,
                x_expand: true,
            });
            const box = new St.BoxLayout({ orientation: Clutter.Orientation.VERTICAL, x_expand: true });
            box.add_child(icon(info.gicon ?? themed('text-x-generic-symbolic'), 28, 'kiwi-notch-shelf-icon'));
            box.add_child(label(info.name, 'kiwi-notch-shelf-name', { x_align: Clutter.ActorAlign.CENTER }));
            tile.set_child(box);
            tile.connect('clicked', () => env.h.onShelf(uri === selected ? 'open' : 'select', uri));
            grid.layout_manager.attach(tile, i % perRow, Math.floor(i / perRow), 1, 1);
            tiles.push({ actor: tile, uri, icon: dragIconName(info.gicon) });
        });
        shelf.add_child(grid);
        env.shelf = { grid, tiles };
        if (uris.length > SHELF_VISIBLE)
            bar.insert_child_at_index(label(`+${uris.length - SHELF_VISIBLE}`, 'kiwi-notch-badge'), 0);
    }
    body.add_child(shelf);
    if (ctx.clipboard)
        body.add_child(clipboardColumn(env, ctx.clipboard, WIDTH.clipboard));
    return body;
}

// ---- Widgets ---------------------------------------------------------------------------

// The notch's own tile: Focus (or Do Not Disturb), the microphone, and timer presets. A small
// card of the strip, drawn at the strip's scaled size.
function controlsCard(env, ctx, side) {
    const ctl = new St.BoxLayout({
        style_class: 'kiwi-notch-widget kiwi-notch-widget-controls kiwi-card',
        orientation: Clutter.Orientation.VERTICAL,
        width: side,
        height: side,
    });
    const toggles = new St.BoxLayout({ style_class: 'kiwi-notch-toggles', x_align: Clutter.ActorAlign.CENTER });
    const toggle = (iconName, name, on, fn, enabled = true) => {
        const box = new St.BoxLayout({ orientation: Clutter.Orientation.VERTICAL, style_class: 'kiwi-notch-toggle-box', x_expand: true });
        const b = button({ styleClass: 'kiwi-notch-toggle kiwi-toolbar-button', iconName, accessibleName: name, size: 16, toggle: on, onClick: fn });
        b.reactive = enabled;
        b.opacity = enabled ? 255 : 110;
        b.x_align = Clutter.ActorAlign.CENTER;
        box.add_child(b);
        box.add_child(label(name, 'kiwi-notch-toggle-caption kiwi-secondary-text kiwi-text-caption', { x_align: Clutter.ActorAlign.CENTER }));
        toggles.add_child(box);
    };
    // The active Focus mode's icon and name (features/focus), else the Do Not Disturb moon
    const focus = ctx.focus?.id ? ctx.focus : null;
    toggle(focus?.icon ?? 'weather-clear-night-symbolic', focus?.name ?? env._('Focus'),
        ctx.dnd || !!focus, () => env.h.onToggleDnd());
    toggle(ctx.mic.muted ? 'microphone-disabled-symbolic' : 'audio-input-microphone-symbolic',
        env._('Mic Off'), ctx.mic.muted, () => env.h.onToggleMic(), ctx.mic.available);
    toggles.y_expand = true;
    ctl.add_child(toggles);
    if (ctx.timersEnabled) {
        const presets = new St.BoxLayout({ style_class: 'kiwi-notch-presets', x_align: Clutter.ActorAlign.CENTER });
        presets.add_child(icon(themed('alarm-symbolic'), 14, 'kiwi-notch-glyph kiwi-notch-tint-orange'));
        for (const m of TIMER_PRESETS) {
            presets.add_child(button({
                styleClass: 'kiwi-notch-chip kiwi-notch-preset',
                text: env._('%dm').format(m),
                accessibleName: env._('Start a %d minute timer').format(m),
                onClick: () => env.h.onTimerPreset(m),
            }));
        }
        ctl.add_child(presets);
    }
    return ctl;
}

// One core/widgets card, drawn at its desktop size and scaled down to the strip (as the
// gallery's previews), inside a button so a press stays on the dashboard and a click opens
// the widget's app. Its data runs only while the tab is shown (view.js sets the views active).
function widgetCard(env, kind, size) {
    const view = env.host.createView(kind, { size, config: {}, surface: 'notch' });
    const full = pixelSize(size);
    const scaled = pixelSize(size, WIDGET_STRIP.scale);
    const holder = new St.Widget({ width: scaled.width, height: scaled.height });
    view.actor.set_scale(WIDGET_STRIP.scale, WIDGET_STRIP.scale);
    holder.add_child(view.actor);
    view.actor.set_size(full.width, full.height);
    const b = new St.Button({
        style_class: 'kiwi-notch-widget-button',
        child: holder,
        can_focus: true,
        accessible_name: env._(view.def.title),
        y_align: Clutter.ActorAlign.CENTER,
    });
    b.connect('clicked', () => env.h.onOpenWidget?.(view));
    env.views.push(view);
    return b;
}

// "Edit": every kind with its sizes; a size that would overflow the strip is disabled
function chooser(env, ctx) {
    const registry = env.host.registry;
    const sizesFor = kind => (kind === NOTCH_CONTROLS ? ['small'] : registry.sizesFor(kind, 'notch'));
    const grid = buildChooser({
        _: env._,
        entries: [{ kind: NOTCH_CONTROLS, title: N_('Controls') },
            ...registry.kinds().map(k => ({ kind: k.id, title: k.title }))],
        list: ctx.list,
        sizesFor,
        canUse: (kind, size) => fitsStrip(ctx.list, kind, size, WIDGET_STRIP.columns),
        onChange: list => env.h.onSetWidgets?.(list),
        columns: 2,
    });
    const scroll = new St.ScrollView({
        style_class: 'kiwi-notch-chooser', x_expand: true, y_expand: true, overlay_scrollbars: true,
        hscrollbar_policy: St.PolicyType.NEVER, vscrollbar_policy: St.PolicyType.AUTOMATIC,
    });
    const box = new St.BoxLayout({ orientation: Clutter.Orientation.VERTICAL, x_expand: true });
    box.add_child(grid);
    scroll.set_child(box);
    return scroll;
}

/**
 * @param {object} env with `host` (core/widgets) and `views` (the cards built, for setActive)
 * @param {{list: {kind: string, size: string}[], editing: boolean, mic: {available, muted},
 *   dnd: boolean, focus: object|null, timersEnabled: boolean}} ctx
 */
export function widgetsTab(env, ctx) {
    const body = new St.BoxLayout({ style_class: 'kiwi-notch-tab-body kiwi-notch-tab-widgets', x_expand: true, y_expand: true });
    if (!env.host)
        return body;
    if (ctx.editing) {
        body.add_child(chooser(env, ctx));
        return body;
    }
    const { shown } = fitStrip(ctx.list, WIDGET_STRIP.columns);
    if (!shown.length) {
        body.add_child(label(env._('No widgets. Choose Edit to add some.'), 'kiwi-notch-empty-text kiwi-secondary-text', {
            x_expand: true, x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER,
        }));
        return body;
    }
    const strip = new St.BoxLayout({ style_class: 'kiwi-notch-widget-strip', x_expand: true, x_align: Clutter.ActorAlign.CENTER });
    for (const { kind, size } of shown) {
        try {
            strip.add_child(kind === NOTCH_CONTROLS
                ? controlsCard(env, ctx, pixelSize('small', WIDGET_STRIP.scale).width)
                : widgetCard(env, kind, size));
        } catch (e) {
            console.error(`[Kiwi] notch widget ${kind} failed:`, e);
        }
    }
    body.add_child(strip);
    return body;
}
