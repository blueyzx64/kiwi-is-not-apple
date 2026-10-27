// SPDX-License-Identifier: GPL-3.0-or-later
// Async file helpers for the code that touches files outside the extension (lib/cleanup/,
// features/windowControls/gtkTheme.js). Never blocks the compositor: every call is the
// *_async Gio variant.
//
// Rules every caller follows (CLAUDE.md): only Kiwi-marked content is removed, a file Kiwi did
// not create is never deleted (only emptied of Kiwi's part), and a symlink is written through,
// never replaced.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { createJobQueue } from '../jobQueue.js';

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

const asFile = f => (typeof f === 'string' ? Gio.File.new_for_path(f) : f);
const notFound = e => e?.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND);

/** @returns {Promise<boolean>} true when the path exists (a dangling symlink counts) */
export async function exists(file) {
    try {
        await asFile(file).query_info_async('standard::name', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
            GLib.PRIORITY_DEFAULT, null);
        return true;
    } catch (e) {
        if (notFound(e))
            return false;
        throw e;
    }
}

/** @returns {Promise<boolean>} */
export async function isSymlink(file) {
    const info = await asFile(file).query_info_async('standard::is-symlink',
        Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, GLib.PRIORITY_DEFAULT, null);
    return info.get_is_symlink();
}

/** @returns {Promise<?string>} the text, or null when the file does not exist */
export async function readText(file) {
    try {
        const [bytes] = await asFile(file).load_contents_async(null);
        return new TextDecoder().decode(bytes);
    } catch (e) {
        if (notFound(e))
            return null;
        throw e;
    }
}

/**
 * Write text. Never hands an empty buffer to GIO (that call hangs). followLinks (default)
 * writes through a symlink to its target instead of replacing the link (dotfile setups).
 */
export async function writeText(file, text, { followLinks = true, private: priv = false } = {}) {
    const f = asFile(file);
    let flags = followLinks ? Gio.FileCreateFlags.NONE : Gio.FileCreateFlags.REPLACE_DESTINATION;
    if (priv)
        flags |= Gio.FileCreateFlags.PRIVATE;
    if (!text) {
        const stream = await f.replace_async(null, false, flags, GLib.PRIORITY_DEFAULT, null);
        await stream.close_async(GLib.PRIORITY_DEFAULT, null);
        return;
    }
    await f.replace_contents_bytes_async(new GLib.Bytes(new TextEncoder().encode(text)),
        null, false, flags, null);
}

/** Delete a file or an empty directory; a missing one is fine. */
export async function remove(file) {
    try {
        await asFile(file).delete_async(GLib.PRIORITY_DEFAULT, null);
    } catch (e) {
        if (!notFound(e))
            throw e;
    }
}

/** Rename without following symlinks. */
export async function move(from, to) {
    await asFile(from).move_async(asFile(to), Gio.FileCopyFlags.NOFOLLOW_SYMLINKS,
        GLib.PRIORITY_DEFAULT, null, null);
}

/** mkdir (one level); an existing directory is fine. */
export async function makeDirectory(dir) {
    try {
        await asFile(dir).make_directory_async(GLib.PRIORITY_DEFAULT, null);
    } catch (e) {
        if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
            throw e;
    }
}

/** @returns {Promise<string[]>} names in a directory ([] when it does not exist) */
export async function list(dir) {
    let enumerator;
    try {
        enumerator = await asFile(dir).enumerate_children_async('standard::name',
            Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, GLib.PRIORITY_DEFAULT, null);
    } catch (e) {
        if (notFound(e))
            return [];
        throw e;
    }
    const names = [];
    try {
        for (;;) {
            const infos = await enumerator.next_files_async(64, GLib.PRIORITY_DEFAULT, null);
            if (!infos.length)
                break;
            infos.forEach(i => names.push(i.get_name()));
        }
    } finally {
        await enumerator.close_async(GLib.PRIORITY_DEFAULT, null);
    }
    return names;
}

/**
 * Rewrite a text file with `edit(text) -> text`, only if it exists and the result differs.
 * When the result is empty the file is deleted only if `deleteWhenEmpty` (the caller knows
 * Kiwi created it) and it is not a symlink; otherwise it is emptied.
 *
 * @returns {Promise<'missing'|'unchanged'|'written'|'deleted'>}
 */
export async function editText(file, edit, { deleteWhenEmpty = false } = {}) {
    const f = asFile(file);
    const text = await readText(f);
    if (text === null)
        return 'missing';
    const next = edit(text);
    if (next === text)
        return 'unchanged';
    if (!next.trim() && deleteWhenEmpty && !await isSymlink(f)) {
        await remove(f);
        return 'deleted';
    }
    await writeText(f, next.trim() ? next : '');
    return 'written';
}

/**
 * The one queue for every job that edits files in the user's home (gtk.css, environment.d,
 * Mozilla profiles): a lock drops one feature instance and the unlock makes another, and the
 * one-shot cleanup runs beside them, so their read-modify-write sequences must not overlap.
 */
export const enqueueUserFileJob = createJobQueue(e => console.error(`[Kiwi] user file job failed: ${e}`));
