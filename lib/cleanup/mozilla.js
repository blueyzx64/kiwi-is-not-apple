// SPDX-License-Identifier: GPL-3.0-or-later
// Removes what Kiwi 2.x wrote into Firefox and Thunderbird profiles (see mozillaModel.js for
// the exact list), once, after the styling feature was dropped in v3.
//
// Only Kiwi-marked content goes: its block in userChrome.css, its tagged user.js pair, its
// marker and journal, a chrome/ Kiwi created that holds nothing else, and its own state file.
// A chrome/ the user had before is moved back from its backup. Anything else stays: a chrome/
// with new user files is left to the user (only the marker goes), and a user.js Kiwi did not
// create is never deleted, even when it ends up empty.
//
// Async Gio only. Idempotent: run it again and it finds nothing to do.

import GLib from 'gi://GLib';

import * as fs from './fileOps.js';
import {
    MARKER_FILENAME, PENDING_FILENAME, NO_BACKUP, MOZILLA_APPS,
    iniProfiles, parseBackupName, parsePending, parseUserJsCreated, removeKiwiPref,
    stateProfiles, stripKiwiBlock, stripMarkedBlock,
} from './mozillaModel.js';

const join = (...parts) => GLib.build_filenamev(parts);

/** Kiwi 2.x's profile list. */
export function defaultStatePath(dataDir = GLib.get_user_data_dir()) {
    return join(dataDir, 'kiwi', 'mozilla-profiles.json');
}

/**
 * Every profile directory of one app that exists: those Kiwi recorded, and those its
 * installs.ini and profiles.ini name, in both the legacy $HOME and the XDG location.
 */
async function profilesOf(app, { home, configDir, stateText }) {
    const found = new Set(stateProfiles(stateText, app.cssPrefix));
    for (const base of [join(home, ...app.profileBaseDir.split('/')), join(configDir, ...app.xdgProfileDir.split('/'))]) {
        const installs = await fs.readText(join(base, 'installs.ini'), { lossy: true });
        const profiles = await fs.readText(join(base, 'profiles.ini'), { lossy: true });
        for (const { path, relative } of iniProfiles(installs, profiles))
            found.add(GLib.path_is_absolute(path) || !relative ? path : join(base, path));
    }
    const out = [];
    for (const p of found) {
        if (await fs.exists(p))
            out.push(p);
    }
    return out;
}

async function hasForeignFiles(dir, ours) {
    return (await fs.list(dir)).some(name => !ours.includes(name));
}

/** Clean one profile. @returns {Promise<string[]>} what was done, for the log */
export async function cleanProfile(profile, cssPrefix) {
    const p = name => join(profile, ...name.split('/'));
    const chrome = p('chrome');
    const marker = p(`chrome/${MARKER_FILENAME}`);
    const userChrome = p('chrome/userChrome.css');
    const pendingFile = p(PENDING_FILENAME);
    const done = [];

    // 1. A swap a crash left half done: put the user's chrome/ back where it was
    const pending = parsePending(await fs.readText(pendingFile, { lossy: true }) ?? '');
    if (pending && !await fs.exists(marker)) {
        const bak = p(pending.backup);
        if (pending.backup !== NO_BACKUP && await fs.exists(bak)) {
            if (await fs.exists(chrome) && !await hasForeignFiles(chrome, []))
                await fs.remove(chrome);
            if (!await fs.exists(chrome)) {
                await fs.move(bak, chrome);
                done.push(`restored ${pending.backup}`);
            }
        }
    }

    // 2. user.js: the tagged pair only
    const markerText = await fs.readText(marker, { lossy: true });
    const userJs = await fs.editText(p('user.js'), removeKiwiPref,
        { deleteWhenEmpty: parseUserJsCreated(markerText ?? '') });
    if (userJs === 'written' || userJs === 'deleted')
        done.push(`user.js ${userJs}`);

    if (markerText !== null) {
        // 3. Kiwi's chrome/: our block out, then the dir goes if nothing else is in it
        const css = await fs.editText(userChrome, t => stripKiwiBlock(t, cssPrefix), { deleteWhenEmpty: true });
        if (css !== 'missing' && css !== 'unchanged')
            done.push(`userChrome.css ${css}`);
        const backup = parseBackupName(markerText);
        if (await hasForeignFiles(chrome, [MARKER_FILENAME])) {
            // The user keeps files here now: the dir is theirs. Their old chrome/ stays in
            // its backup; never merged or deleted.
            await fs.remove(marker);
            done.push(`kept user files in chrome/; backup ${backup} left in place`);
        } else {
            await fs.remove(marker);
            await fs.remove(chrome);
            const bak = backup === NO_BACKUP ? null : p(backup);
            if (bak && await fs.exists(bak) && !await fs.exists(chrome)) {
                await fs.move(bak, chrome);
                done.push(`restored ${backup}`);
            } else {
                done.push('removed Kiwi chrome/');
            }
        }
    } else {
        // 4. A chrome/ that is not Kiwi's but still carries a marked Kiwi block
        const css = await fs.editText(userChrome, stripMarkedBlock);
        if (css === 'written')
            done.push('Kiwi block removed from userChrome.css');
    }
    await fs.remove(pendingFile);
    return done;
}

/**
 * Clean every Firefox and Thunderbird profile Kiwi may have touched.
 *
 * @param {{home?: string, configDir?: string, dataDir?: string, cancellable?: ?Gio.Cancellable}} [dirs]
 *   directories for tests; a cancelled `cancellable` stops before the next profile
 * @returns {Promise<boolean>} true when every profile was cleaned (the state file is gone)
 */
export async function cleanMozillaProfiles({
    home = GLib.get_home_dir(), configDir = GLib.get_user_config_dir(), dataDir = GLib.get_user_data_dir(),
    cancellable = null,
} = {}) {
    const statePath = defaultStatePath(dataDir);
    const stateText = await fs.readText(statePath, { lossy: true });
    let ok = true;
    for (const app of MOZILLA_APPS) {
        for (const profile of await profilesOf(app, { home, configDir, stateText })) {
            if (cancellable?.is_cancelled())
                return false;
            try {
                const done = await cleanProfile(profile, app.cssPrefix);
                if (done.length)
                    console.log(`[Kiwi] cleanup ${profile}: ${done.join(', ')}`);
            } catch (e) {
                ok = false;
                console.warn(`[Kiwi] cleanup of ${profile} failed, will retry next start: ${e}`);
            }
        }
    }
    if (ok && stateText !== null)
        await fs.remove(statePath);
    return ok;
}
