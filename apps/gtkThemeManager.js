// SPDX-License-Identifier: GPL-3.0-or-later
// Generates GTK CSS imports for window controls and titlebar tweaks based on settings.
//
// Imports are written only to the user's ~/.config/gtk-{3,4}.0/gtk.css so the
// extension never writes inside its own installation directory. This keeps
// system-wide installs (e.g. /usr/share/gnome-shell/extensions, owned by root)
// working. See https://github.com/kem-a/kiwi-kemma/issues/86

// Dangling imports: the managed block holds absolute file:// paths into the extension folder.
// After a shell crash, or an uninstall that skipped disable(), those imports stay in gtk.css.
// GTK only logs a warning for an import it cannot open, so apps keep working; the stale block
// is replaced on the next enable and removed on the next disable. Nothing else is safe to do
// from here: the extension is not running. Manual fix: delete the block between the two
// "Kiwi (is not Apple) - managed imports" comments in ~/.config/gtk-{3,4}.0/gtk.css.
// (A "Remove Kiwi GTK changes" button in prefs could call the same cleanup.)

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { CleanupRegistry } from '../lib/disposables.js';
import { KiwiSettings } from '../lib/settings.js';
import { MIGRATIONS as WINDOW_CONTROLS_MIGRATIONS, titlebarHideSheet, createJobQueue } from './windowControls/model.js';

const MARKER_BEGIN = '/* Kiwi (is not Apple) - managed imports: begin */';
const MARKER_END = '/* Kiwi (is not Apple) - managed imports: end */';

// Matches the whole managed block, including the markers themselves.
const MANAGED_BLOCK_REGEX = /\/\* Kiwi \(is not Apple\) - managed imports: begin \*\/[\s\S]*?\/\* Kiwi \(is not Apple\) - managed imports: end \*\/\n?/g;

// Matches any single-line @import pointing into the extension, in any quoting
// style. Cleans up the unmarked imports written by versions <= 1.9.1.
const LEGACY_IMPORT_REGEX = /^[^\n]*@import[^\n]*kiwi@kemma[^\n]*\n?/gm;

let gtkThemeManager = null;

// File work runs one job at a time across ALL manager instances: a lock drops one instance and
// the unlock makes another, and their jobs must not overlap on the same gtk.css files.
const enqueueFileJob = createJobQueue(error => console.error(`[Kiwi] GTK css job failed: ${error}`));

class GtkThemeManager {
    constructor(ext) {
        this._extension = ext;
        this._ks = null;
        this._cleanup = new CleanupRegistry();
    }

    // Absolute file:// URI for a stylesheet shipped in the extension's css folder.
    _cssUri(name) {
        const path = GLib.build_filenamev([this._extension.path, 'css', name]);
        return Gio.File.new_for_path(path).get_uri();
    }

    // Stylesheets to pull in for a given GTK major version ('3' or '4').
    _stylesheetsFor(version) {
        const ks = this._ks;
        const enableAppButtons = ks.bool('enable-app-window-buttons');
        const buttonType = ks.string('button-type');
        const buttonSize = ks.string('button-size');
        const appFixes = ks.bool('popup-menu-styling');

        const sheets = [];

        // Titlebutton styling only if app window buttons are enabled
        if (enableAppButtons) {
            if (buttonType === 'titlebuttons-alt') {
                sheets.push(`titlebuttons-alt${version}.css`);
            } else {
                sheets.push(`titlebuttons${version}.css`);
                // Glass only overrides the images of the default set
                if (buttonType === 'titlebuttons-glass')
                    sheets.push(`titlebuttons-glass${version}.css`);
            }

            if (buttonSize === 'small') {
                sheets.push(`titlebuttons-size-small${version}.css`);
                if (buttonType === 'titlebuttons-glass')
                    sheets.push(`titlebuttons-glass-size-small${version}.css`);
            }
        }

        // Remove the titlebar buttons of CSD windows while the panel shows the controls
        const hide = titlebarHideSheet({
            showOnPanel: ks.bool('show-window-controls'),
            remove: ks.bool('remove-titlebar-buttons'),
            scope: ks.string('window-controls-scope'),
            gtkVersion: version,
        });
        if (hide)
            sheets.push(hide);

        // App fixes go last so they can override the above
        if (appFixes)
            sheets.push(`fixes${version}.css`);

        return sheets;
    }

    _buildManagedBlock(version) {
        const sheets = this._stylesheetsFor(version);
        if (!sheets.length)
            return '';

        const imports = sheets.map(name => `@import url("${this._cssUri(name)}");`);
        return `${MARKER_BEGIN}\n${imports.join('\n')}\n${MARKER_END}\n`;
    }

    _enqueue(job) {
        return enqueueFileJob(job);
    }

    // Settings are read now, the files are written later, so a disable cannot starve the job.
    updateGtkCss() {
        const configDir = GLib.get_user_config_dir();
        const jobs = ['3', '4'].map(version => ({
            dir: GLib.build_filenamev([configDir, `gtk-${version}.0`]),
            block: this._buildManagedBlock(version),
        }));
        return this._enqueue(async () => {
            for (const { dir, block } of jobs)
                await this.processUserGtkFile(dir, block);
        });
    }

    // Replaces our managed block in <dir>/gtk.css, leaving the user's own rules untouched.
    // An empty block removes our imports. The file is deleted only when it held our block
    // and nothing else; a file we did not write to is never touched.
    async processUserGtkFile(dirPath, managedBlock) {
        const filePath = GLib.build_filenamev([dirPath, 'gtk.css']);
        try {
            const file = Gio.File.new_for_path(filePath);

            let existing = null;
            try {
                const [contents] = await file.load_contents_async(null);
                existing = new TextDecoder().decode(contents);
            } catch (e) {
                if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                    throw e;
            }

            if (existing === null && !managedBlock)
                return;

            // Strip any previous block, plus unmarked imports from older versions
            const rest = (existing ?? '')
                .replace(MANAGED_BLOCK_REGEX, '')
                .replace(LEGACY_IMPORT_REGEX, '');
            const hadOurs = existing !== null && rest !== existing;

            // Our imports come first so user rules can still override them
            const newContent = managedBlock + rest;

            if (newContent === existing)
                return;

            if (!newContent.trim()) {
                if (hadOurs)
                    await file.delete_async(GLib.PRIORITY_DEFAULT, null);
                return;
            }

            if (existing === null) {
                try {
                    await Gio.File.new_for_path(dirPath).make_directory_async(GLib.PRIORITY_DEFAULT, null);
                } catch (e) {
                    if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
                        throw e;
                }
            }
            await file.replace_contents_bytes_async(
                new GLib.Bytes(new TextEncoder().encode(newContent)),
                null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        } catch (error) {
            console.error(`[Kiwi] Error processing GTK file ${filePath}: ${error}`);
        }
    }

    removeUserGtkConfig() {
        const configDir = GLib.get_user_config_dir();
        return this._enqueue(async () => {
            for (const version of ['3', '4'])
                await this.processUserGtkFile(GLib.build_filenamev([configDir, `gtk-${version}.0`]), '');
        });
    }

    enable() {
        const ks = new KiwiSettings(this._extension.getSettings());
        this._ks = ks;
        // The panel scope replaced "fullscreen only"; the css below reads the new key
        ks.migrate(WINDOW_CONTROLS_MIGRATIONS);
        ks.attach(this._cleanup);
        ks.watch([
            'enable-app-window-buttons', 'button-type', 'button-size', 'show-window-controls',
            'window-controls-scope', 'remove-titlebar-buttons', 'popup-menu-styling',
        ], () => this.updateGtkCss());

        this.updateGtkCss();
    }

    disable() {
        this._cleanup.dispose();
        this._ks = null;

        // Remove our imports from user GTK config files
        this.removeUserGtkConfig();

        this._extension = null;
    }
}

export function enable(ext) {
    Gio._promisify(Gio.File.prototype, 'load_contents_async', 'load_contents_finish');
    Gio._promisify(Gio.File.prototype, 'make_directory_async', 'make_directory_finish');
    Gio._promisify(Gio.File.prototype, 'delete_async', 'delete_finish');
    Gio._promisify(Gio.File.prototype, 'replace_contents_bytes_async', 'replace_contents_finish');
    if (!gtkThemeManager) {
        gtkThemeManager = new GtkThemeManager(ext);
        gtkThemeManager.enable();
    }
}

export function disable() {
    if (gtkThemeManager) {
        gtkThemeManager.disable();
        gtkThemeManager = null;
    }
}
