// SPDX-License-Identifier: GPL-3.0-or-later
// Shared base class for managing Mozilla app (Firefox/Thunderbird) userChrome.css
// imports aligned with the extension's window control settings.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {createJobQueue} from './windowControls/model.js';

Gio._promisify(Gio.File.prototype, 'load_contents_async', 'load_contents_finish');
Gio._promisify(Gio.File.prototype, 'replace_contents_bytes_async', 'replace_contents_finish');
Gio._promisify(Gio.File.prototype, 'query_info_async', 'query_info_finish');
Gio._promisify(Gio.File.prototype, 'make_directory_async', 'make_directory_finish');
Gio._promisify(Gio.File.prototype, 'delete_async', 'delete_finish');
Gio._promisify(Gio.File.prototype, 'move_async', 'move_finish');
Gio._promisify(Gio.File.prototype, 'enumerate_children_async', 'enumerate_children_finish');
Gio._promisify(Gio.FileEnumerator.prototype, 'next_files_async', 'next_files_finish');
Gio._promisify(Gio.FileEnumerator.prototype, 'close_async', 'close_finish');

const KIWI_MARKER_FILENAME = '.kiwi-managed';

// user.js: the tag comment and the pref line Kiwi adds. Only a pair written by Kiwi is removed.
const PREF_TAG = '// Added by Kiwi extension to enable userChrome.css';
const PREF_LINE = 'user_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);';

/** user.js text with the Kiwi pref appended, unless the pref is already there. */
export function addKiwiPref(content) {
    if (content.includes(PREF_LINE))
        return content;
    return `${content.trim() ? `${content.trim()}\n` : ''}${PREF_TAG}\n${PREF_LINE}\n`;
}

/** user.js text without the tag + pref pair Kiwi added. A pref without the tag is the user's. */
export function removeKiwiPref(content) {
    const lines = content.split('\n');
    const out = [];
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === PREF_TAG && lines[i + 1]?.trim() === PREF_LINE) {
            i++;
            continue;
        }
        out.push(lines[i]);
    }
    const text = out.join('\n');
    return text.trim() ? text : '';
}

/** Backup dir name recorded in the marker body; old markers have none, so chrome.bak. */
export function parseBackupName(markerText) {
    const m = markerText.match(/^backup=([^/\n]+)$/m);
    return m ? m[1] : 'chrome.bak';
}

/** Sections of a Mozilla profiles.ini / installs.ini: [{name, data}]. */
export function parseIni(text) {
    const sections = [];
    let s = {name: '', data: {}};
    for (const line of text.split(/\r?\n/)) {
        const t = line.trim();
        if (!t) continue;
        if (t.startsWith('[') && t.endsWith(']')) {
            if (s.name) sections.push(s);
            s = {name: t.slice(1, -1), data: {}};
        } else if (t.includes('=')) {
            const i = t.indexOf('=');
            s.data[t.slice(0, i)] = t.slice(i + 1);
        }
    }
    if (s.name) sections.push(s);
    return sections;
}

async function fileExists(file) {
    try {
        await file.query_info_async('standard::name', Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null);
        return true;
    } catch (e) {
        if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
            return false;
        throw e;
    }
}

async function makeDirectory(dir) {
    // Parents are the profile dir, which exists already.
    try {
        await dir.make_directory_async(GLib.PRIORITY_DEFAULT, null);
    } catch (e) {
        if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
            throw e;
    }
}

function writeFile(file, text) {
    return file.replace_contents_bytes_async(new GLib.Bytes(new TextEncoder().encode(text)),
        null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
}

/**
 * MozillaThemeManager — reusable manager for injecting Kiwi window‐control
 * CSS into any Mozilla application that supports userChrome.css.
 *
 * @param {object} ext       – GNOME Shell Extension instance
 * @param {object} config
 * @param {string} config.settingsKey    – GSettings boolean key that toggles this app's styling
 * @param {string} config.profileBaseDir – relative path under $HOME (e.g. '.mozilla/firefox')
 * @param {string} config.xdgProfileDir  – relative path under $XDG_CONFIG_HOME (e.g. 'mozilla/firefox')
 * @param {string} config.cssPrefix      – CSS filename prefix (e.g. 'firefoxWindowControls')
 * @param {string} config.logPrefix      – label used in log messages
 */
export class MozillaThemeManager {
    constructor(ext, config) {
        this._extension = ext;
        this._config = config;
        this._settings = null;
        this._settingsChangedId = null;
        this._queue = createJobQueue(e => console.error(`[Kiwi] ${config.logPrefix} file job failed: ${e}`));
    }

    enable() {
        this._settings = this._extension.getSettings();
        this._settingsChangedId = this._settings.connect('changed', (_settings, key) => {
            if (key === this._config.settingsKey || key === 'enable-app-window-buttons' || key === 'button-type' || key === 'button-size' || key === 'show-window-controls' || key === 'remove-titlebar-buttons') {
                this.updateCss();
            }
        });
        this.updateCss();
    }

    disable() {
        this._settings.disconnect(this._settingsChangedId);
        this._settingsChangedId = null;
        this._settings = null;
        this.removeCss();
        this._extension = null;
    }

    // One job at a time per manager so an update and a disable never interleave on the files.
    _enqueue(job) {
        return this._queue(job);
    }

    updateCss() {
        // Settings are read now; the files are written later.
        const settings = this._settings;
        if (!settings)
            return Promise.resolve();
        const snapshot = {
            enableStyling: settings.get_boolean(this._config.settingsKey),
            enableAppButtons: settings.get_boolean('enable-app-window-buttons'),
            // Hide the native buttons only while the panel shows them and removal is wanted
            showControlsOnPanel: settings.get_boolean('show-window-controls') &&
                settings.get_boolean('remove-titlebar-buttons'),
            buttonType: settings.get_string('button-type'),
            buttonSize: settings.get_string('button-size'),
            cssRoot: `${this._extension.path}/css`,
        };
        return this._enqueue(() => this._writeCss(snapshot));
    }

    async _writeCss({enableStyling, enableAppButtons, showControlsOnPanel, buttonType, buttonSize, cssRoot}) {
        // Only touch the profile when the user turned on styling for this app.
        if (!enableStyling) {
            await this._removeCss();
            return;
        }

        const profile = await this._getDefaultProfile();
        if (!profile) {
            console.debug(`[Kiwi] ${this._config.logPrefix} no profile found`);
            return;
        }

        const prefix = this._config.cssPrefix;

        try {
            const chromeDir = GLib.build_filenamev([profile, 'chrome']);
            const chromeGFile = Gio.File.new_for_path(chromeDir);
            let backupName = null;

            if (await fileExists(chromeGFile)) {
                if (await this._isChromeManagedByKiwi(chromeDir)) {
                    // Ours already: keep it and rewrite userChrome.css in place.
                    backupName = await this._readBackupName(chromeDir);
                } else {
                    // User's own chrome/: move it aside, never delete it.
                    backupName = await this._pickBackupName(chromeDir);
                    await chromeGFile.move_async(
                        Gio.File.new_for_path(GLib.build_filenamev([profile, backupName])),
                        Gio.FileCopyFlags.NONE, GLib.PRIORITY_DEFAULT, null, null);
                }
            }

            await makeDirectory(chromeGFile);

            const imports = [];
            if (enableAppButtons) {
                const themingPath = `${cssRoot}/${prefix}.css`;
                const altThemingPath = `${cssRoot}/${prefix}.alt.css`;
                const glassThemingPath = `${cssRoot}/${prefix}.glass.css`;
                if (buttonType === 'titlebuttons-alt') {
                    imports.push(`@import url("file://${altThemingPath}");`);
                } else {
                    imports.push(`@import url("file://${themingPath}");`);
                    // Glass only overrides the images of the default set
                    if (buttonType === 'titlebuttons-glass')
                        imports.push(`@import url("file://${glassThemingPath}");`);
                }

                if (buttonSize === 'small') {
                    const smallSizePath = `${cssRoot}/${prefix}-size-small.css`;
                    imports.push(`@import url("file://${smallSizePath}");`);
                }
            }
            if (showControlsOnPanel) {
                const hiddenPath = `${cssRoot}/${prefix}Hidden.css`;
                imports.push(`@import url("file://${hiddenPath}");`);
            }

            const userChromeContent = imports.join('\n') + (imports.length ? '\n' : '');
            await writeFile(Gio.File.new_for_path(GLib.build_filenamev([chromeDir, 'userChrome.css'])), userChromeContent);

            await this._markChromeAsKiwiManaged(chromeDir, backupName);
            await this._ensureLegacyPref(profile);
        } catch (e) {
            console.error(`[Kiwi] ${this._config.logPrefix} write failed for profile ${profile}: ${e}`);
        }
    }

    removeCss() {
        return this._enqueue(() => this._removeCss());
    }

    async _removeCss() {
        try {
            const profile = await this._getDefaultProfile();
            if (!profile)
                return;

            // The user.js line is Kiwi-tagged, so it is safe to drop whatever state chrome/ is in.
            await this._removeLegacyPref(profile);

            const chromeDir = GLib.build_filenamev([profile, 'chrome']);
            const chromeGFile = Gio.File.new_for_path(chromeDir);

            // Not ours: leave it alone.
            if (!await fileExists(chromeGFile) || !await this._isChromeManagedByKiwi(chromeDir))
                return;

            const backupName = await this._readBackupName(chromeDir);
            if (!await this._removeKiwiFiles(chromeGFile))
                return; // user added files to it; keep them and keep the backup

            const bakGFile = Gio.File.new_for_path(GLib.build_filenamev([profile, backupName]));
            if (await fileExists(bakGFile) && !await fileExists(chromeGFile)) {
                await bakGFile.move_async(chromeGFile, Gio.FileCopyFlags.NONE,
                    GLib.PRIORITY_DEFAULT, null, null);
            }
        } catch (e) {
            console.warn(`[Kiwi] ${this._config.logPrefix} cleanup failed: ${e}`);
        }
    }

    async _markChromeAsKiwiManaged(chromeDirPath, backupName = null) {
        try {
            const markerPath = GLib.build_filenamev([chromeDirPath, KIWI_MARKER_FILENAME]);
            const body = `Kiwi managed chrome folder\n${backupName ? `backup=${backupName}\n` : ''}`;
            await writeFile(Gio.File.new_for_path(markerPath), body);
        } catch (e) {
            console.warn(`[Kiwi] ${this._config.logPrefix} could not write the marker in ${chromeDirPath}: ${e}`);
        }
    }

    // Backup dir name recorded in the marker; old markers have none, so chrome.bak.
    async _readBackupName(chromeDirPath) {
        try {
            const markerPath = GLib.build_filenamev([chromeDirPath, KIWI_MARKER_FILENAME]);
            return parseBackupName(await this._readFileAsync(Gio.File.new_for_path(markerPath)));
        } catch (_e) {
            return 'chrome.bak';
        }
    }

    // chrome.bak if free, else a timestamped name. Never an existing path.
    async _pickBackupName(chromeDirPath) {
        const parent = GLib.path_get_dirname(chromeDirPath);
        if (!await fileExists(Gio.File.new_for_path(GLib.build_filenamev([parent, 'chrome.bak']))))
            return 'chrome.bak';
        const base = `chrome.kiwi-bak-${GLib.DateTime.new_now_local().format('%Y%m%d-%H%M%S')}`;
        let name = base;
        for (let i = 1; await fileExists(Gio.File.new_for_path(GLib.build_filenamev([parent, name]))); i++)
            name = `${base}-${i}`;
        return name;
    }

    // Delete only files Kiwi wrote. Remove the dir only if nothing else is in it.
    async _removeKiwiFiles(dirFile) {
        const kiwiFiles = ['userChrome.css', KIWI_MARKER_FILENAME];
        const enumerator = await dirFile.enumerate_children_async(
            'standard::name', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, GLib.PRIORITY_DEFAULT, null);
        let foreign = false;
        for (;;) {
            const infos = await enumerator.next_files_async(64, GLib.PRIORITY_DEFAULT, null);
            if (!infos.length)
                break;
            for (const info of infos) {
                if (!kiwiFiles.includes(info.get_name()))
                    foreign = true;
            }
        }
        await enumerator.close_async(GLib.PRIORITY_DEFAULT, null);
        for (const name of kiwiFiles) {
            const f = dirFile.get_child(name);
            try {
                await f.delete_async(GLib.PRIORITY_DEFAULT, null);
            } catch (e) {
                if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) {
                    console.warn(`[Kiwi] ${this._config.logPrefix} could not delete ${f.get_path()}: ${e}`);
                    return false;
                }
            }
        }
        if (foreign)
            return false;
        try {
            await dirFile.delete_async(GLib.PRIORITY_DEFAULT, null);
        } catch (e) {
            console.warn(`[Kiwi] ${this._config.logPrefix} could not remove ${dirFile.get_path()}: ${e}`);
            return false;
        }
        return true;
    }

    _isChromeManagedByKiwi(chromeDirPath) {
        const markerPath = GLib.build_filenamev([chromeDirPath, KIWI_MARKER_FILENAME]);
        return fileExists(Gio.File.new_for_path(markerPath));
    }

    async _ensureLegacyPref(profileDir) {
        try {
            const file = Gio.File.new_for_path(GLib.build_filenamev([profileDir, 'user.js']));
            const content = await this._readOptional(file) ?? '';
            const updated = addKiwiPref(content);
            if (updated !== content)
                await writeFile(file, updated);
        } catch (e) {
            console.warn(`[Kiwi] ${this._config.logPrefix} could not update user.js: ${e}`);
        }
    }

    // Removes only the line Kiwi added (tagged). A pref the user wrote stays.
    async _removeLegacyPref(profileDir) {
        try {
            const file = Gio.File.new_for_path(GLib.build_filenamev([profileDir, 'user.js']));
            const content = await this._readOptional(file);
            if (content === null)
                return;
            const updated = removeKiwiPref(content);
            if (updated === content)
                return;
            // Nothing left means Kiwi created the file, so remove it rather than leave it empty.
            if (!updated.trim())
                await file.delete_async(GLib.PRIORITY_DEFAULT, null);
            else
                await writeFile(file, updated);
        } catch (e) {
            console.warn(`[Kiwi] ${this._config.logPrefix} could not clean user.js: ${e}`);
        }
    }

    // File text, or null when the file does not exist.
    async _readOptional(file) {
        try {
            return await this._readFileAsync(file);
        } catch (e) {
            if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                return null;
            throw e;
        }
    }

    /**
     * Locate the default profile directory.
     * Tries installs.ini first, falls back to profiles.ini.
     */
    async _getDefaultProfile() {
        // Legacy $HOME dir wins when present, same as Mozilla; else XDG config dir (Firefox 147+)
        const baseDirs = [
            GLib.build_filenamev([GLib.get_home_dir(), ...this._config.profileBaseDir.split('/')]),
            GLib.build_filenamev([GLib.get_user_config_dir(), ...this._config.xdgProfileDir.split('/')]),
        ];

        for (const baseDir of baseDirs) {
            const profile = (await this._getProfileFromInstallsIni(baseDir))
                ?? (await this._getProfileFromProfilesIni(baseDir));
            if (profile)
                return profile;
        }
        return null;
    }

    async _getProfileFromInstallsIni(baseDir) {
        try {
            const installsIni = Gio.File.new_for_path(`${baseDir}/installs.ini`);
            if (!await fileExists(installsIni))
                return null;

            const sections = await this._parseIniFile(installsIni);

            let chosen = sections.find(sec => sec.data.Default && sec.data.Locked === '1');
            if (!chosen)
                chosen = sections.find(sec => sec.data.Default);
            if (!chosen)
                return null;

            const path = chosen.data.Default;
            const abs = GLib.build_filenamev([baseDir, path]);
            return await fileExists(Gio.File.new_for_path(abs)) ? abs : null;
        } catch (_e) {
            return null;
        }
    }

    async _getProfileFromProfilesIni(baseDir) {
        try {
            const profilesIni = Gio.File.new_for_path(`${baseDir}/profiles.ini`);
            if (!await fileExists(profilesIni))
                return null;

            const sections = await this._parseIniFile(profilesIni);

            // Find the profile marked as Default=1
            let chosen = sections.find(sec => sec.name.startsWith('Profile') && sec.data.Default === '1');
            if (!chosen)
                chosen = sections.find(sec => sec.name.startsWith('Profile') && sec.data.Path);
            if (!chosen)
                return null;

            const path = chosen.data.Path;
            const isRelative = chosen.data.IsRelative === '1';
            const abs = isRelative ? GLib.build_filenamev([baseDir, path]) : path;
            return await fileExists(Gio.File.new_for_path(abs)) ? abs : null;
        } catch (_e) {
            return null;
        }
    }

    async _parseIniFile(file) {
        return parseIni(await this._readFileAsync(file));
    }

    async _readFileAsync(file) {
        const [bytes] = await file.load_contents_async(null);
        return new TextDecoder().decode(bytes);
    }
}
