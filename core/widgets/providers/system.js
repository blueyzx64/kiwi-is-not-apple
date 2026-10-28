// SPDX-License-Identifier: GPL-3.0-or-later
// System data: CPU use, memory, network throughput and the home disk, sampled every few
// seconds and only while a System widget is visible (the provider stops with the last one).
// Reads /proc/stat, /proc/meminfo and /proc/net/dev and the home file system's size
// asynchronously, so the compositor never waits on them. The disk changes slowly: it is read
// every DISK_EVERY samples.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { cpuUsage, netRate, parseCpu, parseMemory, parseNetDev } from '../data.js';
import { Provider } from './base.js';

const INTERVAL_MS = 2000;
const HISTORY = 30;
const DISK_EVERY = 15;

function readText(path, cancel) {
    return new Promise((resolve, reject) => {
        Gio.File.new_for_path(path).load_contents_async(cancel, (f, res) => {
            try {
                const [, bytes] = f.load_contents_finish(res);
                resolve(new TextDecoder().decode(bytes));
            } catch (e) {
                reject(e);
            }
        });
    });
}

function readDisk(cancel) {
    return new Promise(resolve => {
        Gio.File.new_for_path(GLib.get_home_dir()).query_filesystem_info_async('filesystem::size,filesystem::free',
            GLib.PRIORITY_LOW, cancel, (f, res) => {
                try {
                    const info = f.query_filesystem_info_finish(res);
                    const total = info.get_attribute_uint64('filesystem::size');
                    const free = info.get_attribute_uint64('filesystem::free');
                    resolve(total > 0 ? { used: total - free, total } : null);
                } catch (_e) {
                    resolve(null);
                }
            });
    });
}

export class SystemProvider extends Provider {
    initial() {
        return { cpu: 0, history: [], memory: null, disk: null, net: { rx: 0, tx: 0 }, netHistory: [] };
    }

    run(cleanup) {
        const cancel = new Gio.Cancellable();
        cleanup.add(() => cancel.cancel());
        this._prev = null;
        this._prevNet = null;
        this._prevTime = 0;
        this._history = [];
        this._netHistory = [];
        this._disk = null;
        this._count = 0;
        this._sample(cancel);
        cleanup.timeout(INTERVAL_MS, () => {
            this._sample(cancel);
            return true;
        }, { name: 'kiwi-widgets-system' });
    }

    async _sample(cancel) {
        let stat, mem, dev;
        const diskDue = this._count++ % DISK_EVERY === 0;
        try {
            [stat, mem, dev] = await Promise.all([
                readText('/proc/stat', cancel), readText('/proc/meminfo', cancel), readText('/proc/net/dev', cancel).catch(() => ''),
            ]);
            if (diskDue)
                this._disk = await readDisk(cancel);
        } catch (_e) {
            return; // cancelled, or no /proc: keep the last values
        }
        if (cancel.is_cancelled())
            return;
        const next = parseCpu(stat);
        const cpu = cpuUsage(this._prev, next);
        this._prev = next;
        this._history = [...this._history.slice(1 - HISTORY), cpu];
        const now = GLib.get_monotonic_time() / 1e6;
        const counters = parseNetDev(dev);
        const net = netRate(this._prevNet, counters, now - this._prevTime);
        this._prevNet = counters;
        this._prevTime = now;
        this._netHistory = [...this._netHistory.slice(1 - HISTORY), net.rx + net.tx];
        this.publish({
            cpu, history: this._history, memory: parseMemory(mem), disk: this._disk, net, netHistory: this._netHistory,
        });
    }
}
