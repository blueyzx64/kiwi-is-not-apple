// SPDX-License-Identifier: GPL-3.0-or-later
// What Kiwi wrote into Firefox and Thunderbird profiles (Kiwi 2.x "Firefox/Thunderbird
// styling", removed in v3), and how to recognise exactly that and nothing else.
// Pure JS (no gi imports); mozilla.js does the file work.
//
// Kiwi 2.x left, per profile it styled:
//   chrome/.kiwi-managed     marker: "Kiwi managed chrome folder", optional backup=<dir>
//                            (the user's own chrome/ moved aside; 'none' = there was none,
//                            no line = chrome.bak) and userjs=created
//   chrome/userChrome.css    its block between "/* Kiwi begin */" and "/* Kiwi end */"
//                            (older: a file of only "/* Kiwi */" and its @import lines)
//   user.js                  the tagged pair "// Added by Kiwi extension ..." + the pref
//   .kiwi-pending            a journal while chrome/ was being swapped (op=install|remove)
//   ~/.local/share/kiwi/mozilla-profiles.json   {"<cssPrefix>": [profile dirs]}

export const MARKER_FILENAME = '.kiwi-managed';
export const PENDING_FILENAME = '.kiwi-pending';
export const NO_BACKUP = 'none';

export const BLOCK_BEGIN = '/* Kiwi begin */';
export const BLOCK_END = '/* Kiwi end */';
// A block holds no second begin marker: with a lost end marker the match would otherwise run on
// from the first begin through the user's rules to a later block's end and delete them.
const BLOCK_REGEX = /\/\* Kiwi begin \*\/(?:(?!\/\* Kiwi begin \*\/)[\s\S])*?\/\* Kiwi end \*\/\n?/g;

const PREF_TAG = '// Added by Kiwi extension to enable userChrome.css';
const PREF_LINE = 'user_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);';

/** The two apps Kiwi 2.x styled. */
export const MOZILLA_APPS = Object.freeze([
    Object.freeze({ cssPrefix: 'firefoxWindowControls', profileBaseDir: '.mozilla/firefox', xdgProfileDir: 'mozilla/firefox' }),
    Object.freeze({ cssPrefix: 'thunderbirdWindowControls', profileBaseDir: '.thunderbird', xdgProfileDir: 'thunderbird' }),
]);

/**
 * True when the whole text is what older Kiwi versions wrote into userChrome.css: nothing,
 * an optional `/* Kiwi *\/` line and Kiwi's own @import lines.
 */
export function isLegacyKiwiOutput(content, cssPrefix) {
    const importRe = new RegExp(`^@import url\\("file://[^"]*/css/${cssPrefix}[A-Za-z.-]*\\.css"\\);$`);
    return content.split('\n').map(l => l.trim()).filter(Boolean)
        .every(l => l === '/* Kiwi */' || importRe.test(l));
}

/** The user's part of userChrome.css: Kiwi's block removed; a legacy Kiwi-only file is ''. */
export function stripKiwiBlock(content, cssPrefix) {
    if (!content.includes(BLOCK_BEGIN) && isLegacyKiwiOutput(content, cssPrefix))
        return '';
    return content.replace(BLOCK_REGEX, '');
}

/** Only the marked block removed (for a chrome/ Kiwi does not own: no legacy guessing). */
export function stripMarkedBlock(content) {
    return content.replace(BLOCK_REGEX, '');
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

/** The pair Kiwi 2.x appended (tests build fixtures with it). */
export function kiwiPrefLines() {
    return `${PREF_TAG}\n${PREF_LINE}\n`;
}

/** True when the marker says Kiwi created the profile's user.js. */
export function parseUserJsCreated(markerText) {
    return /^userjs=created$/m.test(markerText);
}

/** Backup dir name recorded in the marker body; old markers have none, so chrome.bak. */
export function parseBackupName(markerText) {
    const m = markerText.match(/^backup=([^/\n]+)$/m);
    return m ? m[1] : 'chrome.bak';
}

/** Journal: {op: 'install'|'remove', backup}, or null. */
export function parsePending(text) {
    const op = text.match(/^op=(install|remove)$/m)?.[1] ?? null;
    return op ? { op, backup: parseBackupName(text) } : null;
}

/** Journal body. */
export function pendingBody(op, backupName) {
    return `op=${op}\nbackup=${backupName}\n`;
}

/** Sections of a Mozilla profiles.ini / installs.ini: [{name, data}]. */
export function parseIni(text) {
    const sections = [];
    let s = { name: '', data: {} };
    for (const line of text.split(/\r?\n/)) {
        const t = line.trim();
        if (!t)
            continue;
        if (t.startsWith('[') && t.endsWith(']')) {
            if (s.name)
                sections.push(s);
            s = { name: t.slice(1, -1), data: {} };
        } else if (t.includes('=')) {
            const i = t.indexOf('=');
            s.data[t.slice(0, i)] = t.slice(i + 1);
        }
    }
    if (s.name)
        sections.push(s);
    return sections;
}

/** Profile dirs (as written) named by installs.ini [Install*] Default= and profiles.ini. */
export function iniProfiles(installsText, profilesText) {
    const out = [];
    const add = (path, relative) => {
        if (path && !out.some(p => p.path === path))
            out.push({ path, relative });
    };
    for (const sec of parseIni(installsText ?? ''))
        add(sec.data.Default, true);
    for (const sec of parseIni(profilesText ?? '')) {
        if (sec.name.startsWith('Profile') && sec.data.Path)
            add(sec.data.Path, sec.data.IsRelative !== '0');
    }
    return out;
}

/** Profile dirs listed for one app in the state file, absolute paths only. */
export function stateProfiles(stateText, cssPrefix) {
    try {
        const data = JSON.parse(stateText ?? '{}');
        const list = data?.[cssPrefix];
        return Array.isArray(list) ? list.filter(p => typeof p === 'string' && p.startsWith('/')) : [];
    } catch (_e) {
        return [];
    }
}
