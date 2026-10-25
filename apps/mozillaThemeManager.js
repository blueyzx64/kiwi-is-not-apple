// SPDX-License-Identifier: GPL-3.0-or-later
// Shared base class for managing Mozilla app (Firefox/Thunderbird) userChrome.css
// imports aligned with the extension's window control settings.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {createJobQueue, appButtonsMacos} from './windowControls/model.js';

Gio._promisify(Gio.File.prototype, 'load_contents_async', 'load_contents_finish');
Gio._promisify(Gio.File.prototype, 'replace_contents_bytes_async', 'replace_contents_finish');
Gio._promisify(Gio.File.prototype, 'query_info_async', 'query_info_finish');
Gio._promisify(Gio.File.prototype, 'make_directory_async', 'make_directory_finish');
Gio._promisify(Gio.File.prototype, 'replace_async', 'replace_finish');
Gio._promisify(Gio.OutputStream.prototype, 'close_async', 'close_finish');
Gio._promisify(Gio.File.prototype, 'delete_async', 'delete_finish');
Gio._promisify(Gio.File.prototype, 'move_async', 'move_finish');
Gio._promisify(Gio.File.prototype, 'enumerate_children_async', 'enumerate_children_finish');
Gio._promisify(Gio.FileEnumerator.prototype, 'next_files_async', 'next_files_finish');
Gio._promisify(Gio.FileEnumerator.prototype, 'close_async', 'close_finish');

const KIWI_MARKER_FILENAME = '.kiwi-managed';
// Journal in the profile dir while chrome/ is being swapped, so a crash can be finished or undone.
// Marker value for a chrome/ Kiwi created from nothing: there is no user dir to restore.
// Markers from older versions have no backup= line and mean chrome.bak.
const NO_BACKUP = 'none';
const KIWI_PENDING_FILENAME = '.kiwi-pending';

// userChrome.css: Kiwi's imports live between these lines; the rest of the file is the user's.
export const BLOCK_BEGIN = '/* Kiwi begin */';
export const BLOCK_END = '/* Kiwi end */';
const BLOCK_REGEX = /\/\* Kiwi begin \*\/[\s\S]*?\/\* Kiwi end \*\/\n?/g;

// Every Mozilla app shares one queue: they share the profile state file below.
const enqueueFileJob = createJobQueue(e => console.error(`[Kiwi] Mozilla file job failed: ${e}`));

/** Kiwi's profile state file: {"<cssPrefix>": ["/abs/profile", ...]}. */
export function defaultStatePath() {
    return GLib.build_filenamev([GLib.get_user_data_dir(), 'kiwi', 'mozilla-profiles.json']);
}

/**
 * True when the whole text is what older Kiwi versions wrote into userChrome.css: nothing,
 * an optional `/* Kiwi *\/` line and our own @import lines. Such a file is migrated to the block.
 */
export function isLegacyKiwiOutput(content, cssPrefix) {
    const importRe = new RegExp(`^@import url\\("file://[^"]*/css/${cssPrefix}[A-Za-z.-]*\\.css"\\);$`);
    return content.split('\n').map(l => l.trim()).filter(Boolean)
        .every(l => l === '/* Kiwi */' || importRe.test(l));
}

/** The user's part of userChrome.css: our block removed, a legacy Kiwi-only file counts as empty. */
export function stripKiwiBlock(content, cssPrefix) {
    if (!content.includes(BLOCK_BEGIN) && isLegacyKiwiOutput(content, cssPrefix))
        return '';
    return content.replace(BLOCK_REGEX, '');
}

/** userChrome.css with our block first (@import must precede rules) and the user's text kept. */
export function applyKiwiBlock(content, imports, cssPrefix) {
    const block = `${BLOCK_BEGIN}\n${imports.map(l => `${l}\n`).join('')}${BLOCK_END}\n`;
    return block + stripKiwiBlock(content ?? '', cssPrefix);
}

/** Journal body / parse: {op: 'install'|'remove', backup}. */
export function pendingBody(op, backupName) {
    return `op=${op}\nbackup=${backupName}\n`;
}
export function parsePending(text) {
    const op = text.match(/^op=(install|remove)$/m)?.[1] ?? null;
    return op ? {op, backup: parseBackupName(text)} : null;
}

/** Profile dirs named by every [Install*] Default= in installs.ini, relative to baseDir, deduped. */
export function installsIniProfiles(sections) {
    const out = [];
    for (const sec of sections) {
        if (sec.data.Default && !out.includes(sec.data.Default))
            out.push(sec.data.Default);
    }
    return out;
}

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

/** True when the marker says Kiwi created the profile's user.js. */
export function parseUserJsCreated(markerText) {
    return /^userjs=created$/m.test(markerText);
}

/** Marker file body. */
export function markerBody(backupName, userJsCreated) {
    return `Kiwi managed chrome folder\n${backupName ? `backup=${backupName}\n` : ''}${userJsCreated ? 'userjs=created\n' : ''}`;
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

async function deleteIfExists(file) {
    try {
        await file.delete_async(GLib.PRIORITY_DEFAULT, null);
    } catch (e) {
        if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
            throw e;
    }
}

// mkdir -p, async; the dirs it creates are only ours if they did not exist.
async function makeDirectoryWithParents(dir) {
    if (await fileExists(dir))
        return;
    const parent = dir.get_parent();
    if (parent)
        await makeDirectoryWithParents(parent);
    await makeDirectory(dir);
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

/**
 * Write text atomically. Never hands an empty buffer to GIO (that call hangs and would stall
 * the job queue). followLinks writes through a symlink instead of replacing it (dotfile setups).
 */
async function writeFile(file, text, {followLinks = false, private: priv = false} = {}) {
    let flags = followLinks ? Gio.FileCreateFlags.NONE : Gio.FileCreateFlags.REPLACE_DESTINATION;
    if (priv)
        flags |= Gio.FileCreateFlags.PRIVATE;
    if (!text) {
        const stream = await file.replace_async(null, false, flags, GLib.PRIORITY_DEFAULT, null);
        await stream.close_async(GLib.PRIORITY_DEFAULT, null);
        return;
    }
    await file.replace_contents_bytes_async(new GLib.Bytes(new TextEncoder().encode(text)),
        null, false, flags, null);
}


/**
 * MozillaThemeManager — reusable manager for injecting Kiwi window‐control
 * CSS into any Mozilla application that supports userChrome.css.
 *
 * Kiwi only ever deletes what it wrote: its block in userChrome.css, its marker, its tagged
 * user.js lines, and a chrome/ dir it created and that holds nothing else. Every profile it
 * touched is recorded in the state file so a later disable cleans them all, even after the
 * default profile changed.
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
        this._statePath = defaultStatePath();
    }

    enable() {
        this._settings = this._extension.getSettings();
        this._settingsChangedId = this._settings.connect('changed', (_settings, key) => {
            if (key === this._config.settingsKey || key === 'enable-app-window-buttons' || key === 'button-type' || key === 'button-size' || key === 'show-window-controls' || key === 'remove-titlebar-buttons' || key === 'app-buttons-style' || key === 'window-controls-scope') {
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

    _warn(msg) {
        console.warn(`[Kiwi] ${this._config.logPrefix} ${msg}`);
    }

    updateCss() {
        // Settings are read now; the files are written later.
        const settings = this._settings;
        if (!settings)
            return Promise.resolve();
        const snapshot = {
            enableStyling: settings.get_boolean(this._config.settingsKey),
            enableAppButtons: appButtonsMacos({
                showOnPanel: settings.get_boolean('show-window-controls'),
                remove: settings.get_boolean('remove-titlebar-buttons'),
                scope: settings.get_string('window-controls-scope'),
                enableAppButtons: settings.get_boolean('enable-app-window-buttons'),
                style: settings.get_string('app-buttons-style'),
            }),
            // Hide the native buttons only while the panel shows them and removal is wanted
            showControlsOnPanel: settings.get_boolean('show-window-controls') &&
                settings.get_boolean('remove-titlebar-buttons'),
            buttonType: settings.get_string('button-type'),
            buttonSize: settings.get_string('button-size'),
            cssRoot: `${this._extension.path}/css`,
        };
        return enqueueFileJob(() => this._sync(snapshot));
    }

    removeCss() {
        return enqueueFileJob(() => this._sync(null));
    }

    _imports({enableAppButtons, showControlsOnPanel, buttonType, buttonSize, cssRoot}) {
        const prefix = this._config.cssPrefix;
        const sheets = [];
        if (enableAppButtons) {
            if (buttonType === 'titlebuttons-alt') {
                sheets.push(`${prefix}.alt.css`);
            } else {
                sheets.push(`${prefix}.css`);
                // Glass only overrides the images of the default set
                if (buttonType === 'titlebuttons-glass')
                    sheets.push(`${prefix}.glass.css`);
            }
            if (buttonSize === 'small')
                sheets.push(`${prefix}-size-small.css`);
        }
        if (showControlsOnPanel)
            sheets.push(`${prefix}Hidden.css`);
        return sheets.map(name => `@import url("file://${cssRoot}/${name}");`);
    }

    // snapshot null = remove everywhere. Otherwise style the current profiles and clean the
    // ones Kiwi styled before that are no longer current.
    async _sync(snapshot) {
        const known = await this._readState();
        const current = await this._getCurrentProfiles();
        const wanted = snapshot?.enableStyling ? current : [];
        const keep = [];

        for (const profile of [...new Set([...known, ...current])]) {
            try {
                await this._recover(profile);
                if (wanted.includes(profile)) {
                    keep.push(profile); // recorded before the write, so a crash still cleans it
                    await this._writeState([...known, ...keep]);
                    await this._install(profile, this._imports(snapshot));
                } else if (!await this._uninstall(profile)) {
                    keep.push(profile); // try again next time
                }
            } catch (e) {
                console.error(`[Kiwi] ${this._config.logPrefix} profile ${profile}: ${e}`);
                if (known.includes(profile) || wanted.includes(profile))
                    keep.push(profile);
            }
        }
        await this._writeState(keep);
    }

    // ---- state file -------------------------------------------------------------------

    async _readAllState() {
        try {
            const data = JSON.parse(await this._readFileAsync(Gio.File.new_for_path(this._statePath)));
            return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
        } catch (e) {
            if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                this._warn(`state file unreadable, starting empty: ${e}`);
            return {};
        }
    }

    async _readState() {
        const list = (await this._readAllState())[this._config.cssPrefix];
        return Array.isArray(list) ? list.filter(p => typeof p === 'string' && GLib.path_is_absolute(p)) : [];
    }

    async _writeState(list) {
        const profiles = [...new Set(list)];
        const all = await this._readAllState();
        const prev = JSON.stringify(all[this._config.cssPrefix] ?? []);
        if (profiles.length)
            all[this._config.cssPrefix] = profiles;
        else
            delete all[this._config.cssPrefix];
        if (JSON.stringify(all[this._config.cssPrefix] ?? []) === prev)
            return;
        const file = Gio.File.new_for_path(this._statePath);
        if (!Object.keys(all).length) {
            await deleteIfExists(file); // our own file
            return;
        }
        await makeDirectoryWithParents(file.get_parent());
        await writeFile(file, `${JSON.stringify(all, null, 1)}\n`, {private: true});
    }

    // ---- one profile --------------------------------------------------------------------

    _paths(profile) {
        const p = name => Gio.File.new_for_path(GLib.build_filenamev([profile, ...name.split('/')]));
        return {
            chrome: p('chrome'),
            marker: p(`chrome/${KIWI_MARKER_FILENAME}`),
            userChrome: p('chrome/userChrome.css'),
            pending: p(KIWI_PENDING_FILENAME),
            userJs: p('user.js'),
            sibling: name => p(name),
        };
    }

    async _install(profile, imports) {
        const f = this._paths(profile);
        let backupName = NO_BACKUP;
        let userJsCreated = false;

        if (await fileExists(f.marker)) {
            // Ours already: keep it and rewrite our block in place.
            const marker = await this._readOptional(f.marker) ?? '';
            backupName = parseBackupName(marker);
            userJsCreated = parseUserJsCreated(marker);
        } else if (await fileExists(f.chrome)) {
            // User's own chrome/: journal first, then move it aside. Never delete it.
            backupName = await this._pickBackupName(profile);
            await writeFile(f.pending, pendingBody('install', backupName));
            await f.chrome.move_async(f.sibling(backupName), Gio.FileCopyFlags.NOFOLLOW_SYMLINKS,
                GLib.PRIORITY_DEFAULT, null, null);
        }

        await makeDirectory(f.chrome);
        await writeFile(f.marker, markerBody(backupName, userJsCreated));
        await deleteIfExists(f.pending);

        const existing = await this._readOptional(f.userChrome);
        const content = applyKiwiBlock(existing, imports, this._config.cssPrefix);
        if (content !== existing)
            await writeFile(f.userChrome, content, {followLinks: true});

        if (await this._ensureLegacyPref(profile) && !userJsCreated)
            await writeFile(f.marker, markerBody(backupName, true));
    }

    // Returns true when nothing of Kiwi's is left that still needs cleaning.
    async _uninstall(profile) {
        const f = this._paths(profile);
        if (!await fileExists(Gio.File.new_for_path(profile)))
            return true; // profile gone

        const marker = await this._readOptional(f.marker);
        // The user.js line is Kiwi-tagged, so it is safe to drop whatever state chrome/ is in.
        await this._removeLegacyPref(profile, parseUserJsCreated(marker ?? ''));

        if (marker === null)
            return true; // not ours: leave chrome/ alone

        const backupName = parseBackupName(marker);
        await writeFile(f.pending, pendingBody('remove', backupName));
        const done = await this._finishRemove(profile, backupName);
        if (done)
            await deleteIfExists(f.pending);
        return done;
    }

    // Idempotent tail of a removal; also used to finish one a crash interrupted.
    async _finishRemove(profile, backupName) {
        const f = this._paths(profile);

        if (await fileExists(f.marker)) {
            const existing = await this._readOptional(f.userChrome);
            if (existing !== null) {
                const rest = stripKiwiBlock(existing, this._config.cssPrefix);
                if (!rest.trim())
                    await f.userChrome.delete_async(GLib.PRIORITY_DEFAULT, null);
                else if (rest !== existing)
                    await writeFile(f.userChrome, rest, {followLinks: true});
            }
            if (await this._hasForeignFiles(f.chrome, [KIWI_MARKER_FILENAME])) {
                // User files live here now: keep the dir and the marker so it stays ours and
                // the backup can still be restored later.
                await deleteIfExists(f.pending);
                return false;
            }
            // Marker goes last, right before the empty dir; the journal covers the gap.
            await f.marker.delete_async(GLib.PRIORITY_DEFAULT, null);
        }

        if (await fileExists(f.chrome)) {
            if (await this._hasForeignFiles(f.chrome, []))
                return true; // not ours (the user's restored dir, or new user files)
            await f.chrome.delete_async(GLib.PRIORITY_DEFAULT, null);
        }

        const bak = backupName === NO_BACKUP ? null : f.sibling(backupName);
        if (bak && await fileExists(bak)) {
            await bak.move_async(f.chrome, Gio.FileCopyFlags.NOFOLLOW_SYMLINKS,
                GLib.PRIORITY_DEFAULT, null, null);
        }
        return true;
    }

    // Finish or undo a chrome/ swap a crash left half done.
    async _recover(profile) {
        const f = this._paths(profile);
        const text = await this._readOptional(f.pending);
        if (text === null)
            return;
        const pending = parsePending(text);
        if (pending?.op === 'remove') {
            if (await this._finishRemove(profile, pending.backup))
                await deleteIfExists(f.pending);
            return;
        }
        if (pending?.op === 'install' && !await fileExists(f.marker)) {
            const bak = f.sibling(pending.backup);
            if (await fileExists(bak)) {
                // The user's dir was moved aside: put it back; the caller installs again.
                if (await fileExists(f.chrome)) {
                    if (await this._hasForeignFiles(f.chrome, [])) {
                        this._warn(`left ${bak.get_path()} in place: chrome/ has new files`);
                        await deleteIfExists(f.pending);
                        return;
                    }
                    await f.chrome.delete_async(GLib.PRIORITY_DEFAULT, null);
                }
                await bak.move_async(f.chrome, Gio.FileCopyFlags.NOFOLLOW_SYMLINKS,
                    GLib.PRIORITY_DEFAULT, null, null);
            }
        }
        await deleteIfExists(f.pending);
    }

    async _hasForeignFiles(dirFile, ours) {
        const enumerator = await dirFile.enumerate_children_async(
            'standard::name', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, GLib.PRIORITY_DEFAULT, null);
        try {
            for (;;) {
                const infos = await enumerator.next_files_async(64, GLib.PRIORITY_DEFAULT, null);
                if (!infos.length)
                    return false;
                if (infos.some(info => !ours.includes(info.get_name())))
                    return true;
            }
        } finally {
            await enumerator.close_async(GLib.PRIORITY_DEFAULT, null);
        }
    }

    // chrome.bak if free, else a timestamped name. Never an existing path.
    async _pickBackupName(profile) {
        const taken = name => fileExists(Gio.File.new_for_path(GLib.build_filenamev([profile, name])));
        if (!await taken('chrome.bak'))
            return 'chrome.bak';
        const base = `chrome.kiwi-bak-${GLib.DateTime.new_now_local().format('%Y%m%d-%H%M%S')}`;
        let name = base;
        for (let i = 1; await taken(name); i++)
            name = `${base}-${i}`;
        return name;
    }

    // ---- user.js ----------------------------------------------------------------------

    // Returns true when Kiwi created user.js.
    async _ensureLegacyPref(profileDir) {
        try {
            const file = this._paths(profileDir).userJs;
            const existing = await this._readOptional(file);
            const content = existing ?? '';
            const updated = addKiwiPref(content);
            if (updated !== content)
                await writeFile(file, updated, {followLinks: true});
            return existing === null;
        } catch (e) {
            this._warn(`could not update user.js: ${e}`);
            return false;
        }
    }

    // Removes only the line Kiwi added (tagged). A pref the user wrote stays.
    async _removeLegacyPref(profileDir, userJsCreated) {
        try {
            const file = this._paths(profileDir).userJs;
            const content = await this._readOptional(file);
            if (content === null)
                return;
            const updated = removeKiwiPref(content);
            if (updated === content)
                return;
            // Delete only a file Kiwi created (the marker says so); otherwise keep it, even empty.
            if (!updated.trim() && userJsCreated)
                await file.delete_async(GLib.PRIORITY_DEFAULT, null);
            else
                await writeFile(file, updated, {followLinks: true});
        } catch (e) {
            this._warn(`could not clean user.js: ${e}`);
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

    // ---- profile discovery ----------------------------------------------------------------

    /**
     * Profiles the app uses now: every install's Default= in installs.ini (one per
     * Firefox install), else the profiles.ini default. Legacy $HOME dir wins when present,
     * same as Mozilla; else the XDG config dir (Firefox 147+).
     */
    async _getCurrentProfiles() {
        const baseDirs = [
            GLib.build_filenamev([GLib.get_home_dir(), ...this._config.profileBaseDir.split('/')]),
            GLib.build_filenamev([GLib.get_user_config_dir(), ...this._config.xdgProfileDir.split('/')]),
        ];

        for (const baseDir of baseDirs) {
            let profiles = await this._getProfilesFromInstallsIni(baseDir);
            if (!profiles.length) {
                const p = await this._getProfileFromProfilesIni(baseDir);
                profiles = p ? [p] : [];
            }
            if (profiles.length)
                return profiles;
        }
        return [];
    }

    async _getProfilesFromInstallsIni(baseDir) {
        try {
            const text = await this._readOptional(Gio.File.new_for_path(`${baseDir}/installs.ini`));
            if (text === null)
                return [];
            const out = [];
            for (const rel of installsIniProfiles(parseIni(text))) {
                const abs = GLib.path_is_absolute(rel) ? rel : GLib.build_filenamev([baseDir, rel]);
                if (await fileExists(Gio.File.new_for_path(abs)))
                    out.push(abs);
            }
            return out;
        } catch (e) {
            this._warn(`installs.ini unreadable: ${e}`);
            return [];
        }
    }

    async _getProfileFromProfilesIni(baseDir) {
        try {
            const text = await this._readOptional(Gio.File.new_for_path(`${baseDir}/profiles.ini`));
            if (text === null)
                return null;

            const sections = parseIni(text);

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
        } catch (e) {
            this._warn(`profiles.ini unreadable: ${e}`);
            return null;
        }
    }

    async _readFileAsync(file) {
        const [bytes] = await file.load_contents_async(null);
        return new TextDecoder().decode(bytes);
    }
}
