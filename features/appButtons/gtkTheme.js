// SPDX-License-Identifier: GPL-3.0-or-later
// GTK stylesheets for the apps' own titlebars: the macOS traffic lights of app-buttons-style
// 'macos' (with the press bounce of app-buttons-bounce), the more distinct active window
// (app-buttons-distinct-active), toolbar button shapes (app-buttons-toolbar-shapes) and the
// app fixes of popup-menu-styling. Which sheets: model.js gtkSheets().
//
// Imports are written only to the user's ~/.config/gtk-{3,4}.0/gtk.css, between Kiwi's two
// marker comments, so the extension never writes inside its own installation directory
// (system-wide installs stay read-only; kem-a/kiwi-kemma#86). The rest of the file is the
// user's and is never touched. A gtk.css that held only Kiwi's block is deleted; a symlinked
// one is emptied instead.
//
// Dangling imports: after a crash or an uninstall without disable() the block still points
// into the extension folder. GTK only warns about an import it cannot open; the next enable
// replaces the block, the next disable removes it. Manual fix: delete the block between the
// two "Kiwi (is not Apple) - managed imports" comments.

import GLib from 'gi://GLib';

import { KiwiSettings } from '../../lib/settings.js';
import * as fs from '../../lib/cleanup/fileOps.js';
import { gtkSheets } from './model.js';

const MARKER_BEGIN = '/* Kiwi (is not Apple) - managed imports: begin */';
const MARKER_END = '/* Kiwi (is not Apple) - managed imports: end */';

// The whole managed block, markers included.
const MANAGED_BLOCK_REGEX = /\/\* Kiwi \(is not Apple\) - managed imports: begin \*\/[\s\S]*?\/\* Kiwi \(is not Apple\) - managed imports: end \*\/\n?/g;

// Single-line imports into the extension that versions <= 1.9.1 wrote without markers.
const LEGACY_IMPORT_REGEX = /^[^\n]*@import[^\n]*kiwi@kemma[^\n]*\n?/gm;

const KEYS = ['button-size', 'popup-menu-styling', 'app-buttons-style', 'app-buttons-bounce',
    'app-buttons-distinct-active', 'app-buttons-toolbar-shapes'];

/**
 * gtk.css text with Kiwi's block replaced by `block` ('' removes it), user rules untouched.
 * Pure; exported for tests.
 */
export function withManagedBlock(existing, block) {
    const rest = (existing ?? '').replace(MANAGED_BLOCK_REGEX, '').replace(LEGACY_IMPORT_REGEX, '');
    // Kiwi's imports come first so user rules can still override them
    return block + rest;
}

/**
 * Put `managedBlock` into <dirPath>/gtk.css. The file is created only when there is a block,
 * and deleted only when it held Kiwi's block and nothing else.
 */
export async function processUserGtkFile(dirPath, managedBlock) {
    const filePath = GLib.build_filenamev([dirPath, 'gtk.css']);
    try {
        const existing = await fs.readText(filePath);
        if (existing === null && !managedBlock)
            return;
        const next = withManagedBlock(existing, managedBlock);
        if (next === existing)
            return;
        if (!next.trim()) {
            if (await fs.isSymlink(filePath))
                await fs.writeText(filePath, '');
            else
                await fs.remove(filePath);
            return;
        }
        if (existing === null)
            await fs.makeDirectory(dirPath);
        await fs.writeText(filePath, next);
    } catch (error) {
        // Not valid UTF-8: the user's file stays as it is (rewriting it would damage its text)
        const log = error instanceof fs.NotUtf8Error ? console.warn : console.error;
        log(`[Kiwi] could not update ${filePath}: ${error}`);
    }
}

export class GtkTheme {
    constructor(ctx, cleanup) {
        this._ctx = ctx;
        this._cleanup = cleanup;
        this._gtkDir = GLib.build_filenamev([ctx.extension.path, 'features', 'appButtons', 'gtk']);
    }

    enable() {
        const ks = new KiwiSettings(this._ctx.settings);
        ks.attach(this._cleanup);
        ks.watch(KEYS, () => this._update(ks));
        // The bounce follows Reduce Motion and the animations setting (core/motion)
        this._ctx.events.on('motion-changed', () => this._update(ks), this._cleanup);
        // On stop (lock, disable): Kiwi's imports out of the user's files again
        this._cleanup.add(() => this._write(() => ''));
        this._update(ks);
    }

    disable() {
        // The cleanup registry, disposed right after this, removes the imports
    }

    _block(ks, version) {
        const env = this._ctx.motion?.env ?? { reducedMotion: false, animations: true };
        const sheets = gtkSheets({
            style: ks.string('app-buttons-style'),
            size: ks.string('button-size'),
            appFixes: ks.bool('popup-menu-styling'),
            bounce: ks.bool('app-buttons-bounce'),
            reducedMotion: env.reducedMotion || !env.animations,
            distinctActive: ks.bool('app-buttons-distinct-active'),
            toolbarShapes: ks.bool('app-buttons-toolbar-shapes'),
        }, version);
        if (!sheets.length)
            return '';
        const imports = sheets.map(name =>
            `@import url("${GLib.filename_to_uri(GLib.build_filenamev([this._gtkDir, name]), null)}");`);
        return `${MARKER_BEGIN}\n${imports.join('\n')}\n${MARKER_END}\n`;
    }

    // Settings are read now and the files written later, so a disable cannot starve the job.
    _update(ks) {
        const blocks = { 3: this._block(ks, '3'), 4: this._block(ks, '4') };
        this._write(v => blocks[v]);
    }

    _write(blockFor) {
        const configDir = GLib.get_user_config_dir();
        const jobs = ['3', '4'].map(v => [GLib.build_filenamev([configDir, `gtk-${v}.0`]), blockFor(v)]);
        fs.enqueueUserFileJob(async () => {
            for (const [dir, block] of jobs)
                await processUserGtkFile(dir, block);
        });
    }
}
