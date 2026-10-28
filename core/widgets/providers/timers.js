// SPDX-License-Identifier: GPL-3.0-or-later
// Timers data: Kiwi's own countdown timers (core/timers.js, the ones the notch shows), with a
// one-second tick only while a timer runs and a Timers widget is visible. The widget's
// buttons call startTimer() / pause() / resume() / cancel() here (not start(), the
// provider life cycle).

import { Provider } from './base.js';

const TICK_MS = 1000;

export class TimersProvider extends Provider {
    initial() {
        return { available: false, timers: [], now: Date.now() };
    }

    run(cleanup) {
        const { timers, events } = this._env;
        this._service = timers;
        this._cleanup = cleanup;
        this._tick = 0;
        cleanup.add(() => {
            this._service = null;
            this._tick = 0;
        });
        if (!timers || !events) {
            this.publish({ available: false, timers: [], now: Date.now() });
            return;
        }
        events.on('timers-changed', () => this._read(), cleanup);
        this._read();
    }

    _read() {
        const service = this._service;
        if (!service)
            return;
        const list = service.list();
        this.publish({ available: true, timers: list, now: Date.now() });
        const running = list.some(t => t.state === 'running');
        if (running && !this._tick) {
            this._tick = this._cleanup.timeout(TICK_MS, () => {
                if (!this._service?.list().some(t => t.state === 'running')) {
                    this._tick = 0;
                    this._read();
                    return false;
                }
                this.publish({ available: true, timers: this._service.list(), now: Date.now() });
                return true;
            }, { name: 'kiwi-widgets-timers' });
        } else if (!running && this._tick) {
            this._cleanup.release(this._tick);
            this._tick = 0;
        }
    }

    _run(fn) {
        try {
            if (this._service)
                fn(this._service);
        } catch (e) {
            console.error('[Kiwi] widget timer action failed:', e);
        }
    }

    startTimer(minutes) {
        this._run(s => s.startTimer({ seconds: minutes * 60 }));
    }

    pause(id) {
        this._run(s => s.pause(id));
    }

    resume(id) {
        this._run(s => s.resume(id));
    }

    cancel(id) {
        this._run(s => s.cancel(id));
    }
}
