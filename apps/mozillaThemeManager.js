// SPDX-License-Identifier: GPL-3.0-or-later
// Shared base class for managing Mozilla app (Firefox/Thunderbird) userChrome.css
// imports aligned with the extension's window control settings.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const KIWI_MARKER_FILENAME = '.kiwi-managed';

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
    }

    enable() {
        this._settings = this._extension.getSettings();
        this._settingsChangedId = this._settings.connect('changed', (_settings, key) => {
            if (key === this._config.settingsKey || key === 'enable-app-window-buttons' || key === 'button-type' || key === 'button-size' || key === 'show-window-controls') {
                this.updateCss().catch(e => console.error(`[Kiwi] ${this._config.logPrefix} update error: ${e}`));
            }
        });
        this.updateCss().catch(e => console.error(`[Kiwi] ${this._config.logPrefix} initial update error: ${e}`));
    }

    disable() {
        this._settings.disconnect(this._settingsChangedId);
        this._settingsChangedId = null;
        this._settings = null;
        this.removeCss().catch(e => console.error(`[Kiwi] ${this._config.logPrefix} disable cleanup error: ${e}`));
        this._extension = null;
    }

    async updateCss() {
        const enableStyling = this._settings.get_boolean(this._config.settingsKey);
        const enableAppButtons = this._settings.get_boolean('enable-app-window-buttons');
        const showControlsOnPanel = this._settings.get_boolean('show-window-controls');
        const buttonType = this._settings.get_string('button-type');
        const buttonSize = this._settings.get_string('button-size');

        // Only touch the profile when the user turned on styling for this app.
        if (!enableStyling) {
            await this.removeCss();
            return;
        }

        const profile = await this._getDefaultProfile();
        if (!profile) {
            console.debug(`[Kiwi] ${this._config.logPrefix} no profile found`);
            return;
        }

        const ext = this._extension;
        const cssRoot = `${ext.path}/css`;
        const prefix = this._config.cssPrefix;

        try {
            const chromeDir = GLib.build_filenamev([profile, 'chrome']);
            const chromeGFile = Gio.File.new_for_path(chromeDir);
            let backupName = null;

            if (chromeGFile.query_exists(null)) {
                if (this._isChromeManagedByKiwi(chromeDir)) {
                    // Ours already: keep it and rewrite userChrome.css in place.
                    backupName = this._readBackupName(chromeDir);
                } else {
                    // User's own chrome/: move it aside, never delete it.
                    backupName = this._pickBackupName(chromeDir);
                    chromeGFile.move(Gio.File.new_for_path(GLib.build_filenamev([profile, backupName])),
                        Gio.FileCopyFlags.NONE, null, null);
                }
            }

            GLib.mkdir_with_parents(chromeDir, 0o755);

            const imports = [];
            if (enableStyling && enableAppButtons) {
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

            const userChromePath = GLib.build_filenamev([chromeDir, 'userChrome.css']);
            const userChromeFile = Gio.File.new_for_path(userChromePath);
            userChromeFile.replace_contents(userChromeContent, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);

            this._markChromeAsKiwiManaged(chromeDir, backupName);
            await this._ensureLegacyPref(profile);
        } catch (e) {
            console.error(`[Kiwi] ${this._config.logPrefix} write failed for profile ${profile}: ${e}`);
        }
    }

    async removeCss() {
        try {
            const profile = await this._getDefaultProfile();
            if (!profile)
                return;

            const chromeDir = GLib.build_filenamev([profile, 'chrome']);
            const chromeGFile = Gio.File.new_for_path(chromeDir);

            // Not ours: leave it alone.
            if (!chromeGFile.query_exists(null) || !this._isChromeManagedByKiwi(chromeDir))
                return;

            const backupName = this._readBackupName(chromeDir);
            if (!this._removeKiwiFiles(chromeGFile))
                return; // user added files to it; keep them and keep the backup

            const bakGFile = Gio.File.new_for_path(GLib.build_filenamev([profile, backupName]));
            if (bakGFile.query_exists(null) && !chromeGFile.query_exists(null))
                bakGFile.move(chromeGFile, Gio.FileCopyFlags.NONE, null, null);
        } catch (_e) {
            // ignore cleanup errors
        }
    }

    _markChromeAsKiwiManaged(chromeDirPath, backupName = null) {
        try {
            const markerPath = GLib.build_filenamev([chromeDirPath, KIWI_MARKER_FILENAME]);
            const markerFile = Gio.File.new_for_path(markerPath);
            const body = `Kiwi managed chrome folder\n${backupName ? `backup=${backupName}\n` : ''}`;
            markerFile.replace_contents(body, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        } catch (_e) {
            // ignore marker failures
        }
    }

    // Backup dir name recorded in the marker; old markers have none, so chrome.bak.
    _readBackupName(chromeDirPath) {
        try {
            const markerPath = GLib.build_filenamev([chromeDirPath, KIWI_MARKER_FILENAME]);
            const [, bytes] = Gio.File.new_for_path(markerPath).load_contents(null);
            const m = new TextDecoder().decode(bytes).match(/^backup=([^/\n]+)$/m);
            return m ? m[1] : 'chrome.bak';
        } catch (_e) {
            return 'chrome.bak';
        }
    }

    // chrome.bak if free, else a timestamped name. Never an existing path.
    _pickBackupName(chromeDirPath) {
        const parent = GLib.path_get_dirname(chromeDirPath);
        let name = 'chrome.bak';
        if (Gio.File.new_for_path(GLib.build_filenamev([parent, name])).query_exists(null)) {
            const base = `chrome.kiwi-bak-${GLib.DateTime.new_now_local().format('%Y%m%d-%H%M%S')}`;
            name = base;
            for (let i = 1; Gio.File.new_for_path(GLib.build_filenamev([parent, name])).query_exists(null); i++)
                name = `${base}-${i}`;
        }
        return name;
    }

    // Delete only files Kiwi wrote. Remove the dir only if nothing else is in it.
    _removeKiwiFiles(dirFile) {
        const kiwiFiles = ['userChrome.css', KIWI_MARKER_FILENAME];
        const enumerator = dirFile.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
        let foreign = false;
        let info;
        while ((info = enumerator.next_file(null)) !== null) {
            if (!kiwiFiles.includes(info.get_name()))
                foreign = true;
        }
        enumerator.close(null);
        for (const name of kiwiFiles) {
            const f = dirFile.get_child(name);
            if (f.query_exists(null))
                f.delete(null);
        }
        if (foreign)
            return false;
        dirFile.delete(null);
        return true;
    }

    _isChromeManagedByKiwi(chromeDirPath) {
        const markerPath = GLib.build_filenamev([chromeDirPath, KIWI_MARKER_FILENAME]);
        return Gio.File.new_for_path(markerPath).query_exists(null);
    }

    async _ensureLegacyPref(profileDir) {
        try {
            const userJsPath = GLib.build_filenamev([profileDir, 'user.js']);
            const file = Gio.File.new_for_path(userJsPath);
            let content = '';
            if (file.query_exists(null))
                content = await this._readFileAsync(file);

            const prefLine = 'user_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);';
            if (!content.includes(prefLine)) {
                content = (content.trim() ? content.trim() + '\n' : '') + `// Added by Kiwi extension to enable userChrome.css\n${prefLine}\n`;
                file.replace_contents(content, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
            }
        } catch (_e) {
            // non-fatal
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
            if (!installsIni.query_exists(null))
                return null;

            const sections = await this._parseIniFile(installsIni);

            let chosen = sections.find(sec => sec.data.Default && sec.data.Locked === '1');
            if (!chosen)
                chosen = sections.find(sec => sec.data.Default);
            if (!chosen)
                return null;

            const path = chosen.data.Default;
            const abs = GLib.build_filenamev([baseDir, path]);
            return Gio.File.new_for_path(abs).query_exists(null) ? abs : null;
        } catch (_e) {
            return null;
        }
    }

    async _getProfileFromProfilesIni(baseDir) {
        try {
            const profilesIni = Gio.File.new_for_path(`${baseDir}/profiles.ini`);
            if (!profilesIni.query_exists(null))
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
            return Gio.File.new_for_path(abs).query_exists(null) ? abs : null;
        } catch (_e) {
            return null;
        }
    }

    async _parseIniFile(file) {
        const text = await this._readFileAsync(file);
        const lines = text.split(/\r?\n/);
        const sections = [];
        let s = {name: '', data: {}};
        for (const line of lines) {
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

    _readFileAsync(file) {
        return new Promise((resolve, reject) => {
            file.load_contents_async(null, (fileObj, res) => {
                try {
                    const [, bytes] = fileObj.load_contents_finish(res);
                    resolve(new TextDecoder().decode(bytes));
                } catch (e) {
                    reject(e);
                }
            });
        });
    }
}
