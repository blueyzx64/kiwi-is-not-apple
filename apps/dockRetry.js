// SPDX-License-Identifier: GPL-3.0-or-later
// Bounded retry: call step() on a timer until it reports success or the tries run
// out. Dash-to-Dock loads late and allocates late, so several dock modules poll for
// it; this is the one way they do it. No gi imports, so it runs under plain gjs -m;
// the timer functions are injected (dockUtils passes GLib's).

/**
 * @param {object} options
 * @param {number} options.interval ms between tries
 * @param {number} options.tries maximum number of step() calls per start()
 * @param {Function} options.step returns true when the wait is over
 * @param {{add: Function, remove: Function}} options.timers add(ms, fn) -> id, where fn
 *   returns true to repeat; remove(id)
 * @param {Function} [options.onDone] called when the retry ends by success or exhaustion
 *   (not when stop() is called)
 * @returns {{start: Function, stop: Function, running: boolean, attempts: number}}
 */
export function boundedRetry({ interval, tries, step, timers, onDone }) {
    let id = 0;
    let attempts = 0;

    const stop = () => {
        if (id)
            timers.remove(id);
        id = 0;
        attempts = 0;
    };

    const tick = () => {
        attempts++;
        const finished = step() === true || attempts >= tries;
        if (!finished)
            return true;
        // The timer removes itself when this returns false
        id = 0;
        attempts = 0;
        onDone?.();
        return false;
    };

    return {
        /** Starts waiting; a no-op while already waiting. Returns the timer id (0 if idle). */
        start() {
            if (!id)
                id = timers.add(interval, tick);
            return id;
        },
        stop,
        get running() {
            return id !== 0;
        },
        get attempts() {
            return attempts;
        },
    };
}
