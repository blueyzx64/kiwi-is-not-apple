// Run: gjs -m tests/panelVisibilityModel.test.js
import {
    initialState, step, visible, wantsStrut, modeFromSettings, edgeSegments, hasMonitorAbove,
    MIGRATIONS, chromeFlagsFor,
} from '../coordinators/panelVisibilityModel.js';
import { runMigrations } from '../lib/settings.js';

let failed = 0;
function test(name, fn) {
    try {
        fn();
        print(`ok   ${name}`);
    } catch (e) {
        failed++;
        print(`FAIL ${name}: ${e.message}`);
    }
}
function eq(a, b) {
    if (JSON.stringify(a) !== JSON.stringify(b))
        throw new Error(`expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

const CFG = { revealDelay: 150, hideDelay: 600 };
const run = (s, ev, cfg = CFG) => step(s, ev, cfg);
const set = (s, patch) => run(s, { type: 'set', patch }).state;

test('mode from settings', () => {
    eq(modeFromSettings({ autohide: false, fullscreenOnly: true }), 'always');
    eq(modeFromSettings({ autohide: true, fullscreenOnly: true }), 'fullscreen-hover');
    eq(modeFromSettings({ autohide: true, fullscreenOnly: false }), 'autohide');
});

test('always mode is always visible and keeps the strut', () => {
    const s = initialState({ mode: 'always', fullscreen: true });
    eq(visible(s), true);
    eq(wantsStrut(s), true);
});

test('autohide starts hidden, has no strut', () => {
    const s = initialState();
    eq(visible(s), false);
    eq(wantsStrut(s), false);
});

test('fullscreen-hover: visible off fullscreen, hidden in fullscreen, strut follows', () => {
    let s = initialState({ mode: 'fullscreen-hover' });
    eq(visible(s), true);
    eq(wantsStrut(s), true);
    s = set(s, { fullscreen: true });
    eq(visible(s), false);
    eq(wantsStrut(s), false);
});

test('edge pressure starts the reveal timer, which reveals and arms the hide timer', () => {
    let r = run(initialState(), { type: 'edge-pressure' });
    eq(r.effects, [{ type: 'timer', name: 'reveal', ms: 150 }]);
    eq(visible(r.state), false);
    r = run(r.state, { type: 'reveal-timer' });
    eq(visible(r.state), true);
    eq(r.effects, [{ type: 'timer', name: 'hide', ms: 600 }]);
});

test('zero reveal delay reveals at once', () => {
    const r = run(initialState(), { type: 'edge-pressure' }, { revealDelay: 0, hideDelay: 600 });
    eq(visible(r.state), true);
});

test('leaving the edge cancels the pending reveal', () => {
    let s = run(initialState(), { type: 'edge-pressure' }).state;
    const r = run(s, { type: 'edge-left' });
    eq(r.effects, [{ type: 'cancel', name: 'reveal' }]);
    s = run(r.state, { type: 'reveal-timer' }).state;
    // a late timer must not be possible in practice, but a revealed bar then simply hides again
    eq(visible(s), true);
});

test('pointer inside keeps the bar, leaving re-arms the hide timer', () => {
    const s = run(initialState(), { type: 'edge-pressure' }, { revealDelay: 0, hideDelay: 600 }).state;
    let r = run(s, { type: 'pointer', inside: true });
    eq(r.effects, [{ type: 'cancel', name: 'hide' }]);
    r = run(r.state, { type: 'hide-timer' });
    eq(visible(r.state), true);
    r = run(r.state, { type: 'pointer', inside: false });
    eq(r.effects, [{ type: 'timer', name: 'hide', ms: 600 }]);
    r = run(r.state, { type: 'hide-timer' });
    eq(visible(r.state), false);
});

test('holds keep the bar visible and release arms a hide', () => {
    let s = initialState();
    s = run(s, { type: 'hold', id: 'menu:1' }).state;
    eq(visible(s), true);
    s = run(s, { type: 'hold', id: 'notch' }).state;
    s = run(s, { type: 'release', id: 'menu:1' }).state;
    eq(visible(s), true);
    // never revealed by the pointer: release just hides
    s = run(s, { type: 'release', id: 'notch' }).state;
    eq(visible(s), false);
});

test('release after a reveal arms the hide timer', () => {
    let s = run(initialState(), { type: 'reveal-now' }).state;
    s = run(s, { type: 'hold', id: 'a' }).state;
    const r = run(s, { type: 'release', id: 'a' });
    eq(r.effects, [{ type: 'timer', name: 'hide', ms: 600 }]);
});

test('hold survives the hide timer', () => {
    let s = run(initialState(), { type: 'reveal-now' }).state;
    s = run(s, { type: 'hold', id: 'a' }).state;
    s = run(s, { type: 'hide-timer' }).state;
    eq(s.revealed, true);
    eq(visible(s), true);
});

test('duplicate hold id is stored once', () => {
    let s = run(initialState(), { type: 'hold', id: 'a' }).state;
    s = run(s, { type: 'hold', id: 'a' }).state;
    eq(s.holds, ['a']);
});

test('overview shows the bar, leaving it hides at once', () => {
    let s = set(initialState(), { overview: true });
    eq(visible(s), true);
    s = run(s, { type: 'reveal-now' }).state;
    s = set(s, { overview: false });
    eq(visible(s), false);
    eq(s.revealed, false);
});

test('keep on desktop shows an empty desktop only', () => {
    let s = initialState({ keepOnDesktop: true, desktop: true });
    eq(visible(s), true);
    s = set(s, { desktop: false });
    eq(visible(s), false);
    eq(visible(initialState({ keepOnDesktop: false, desktop: true })), false);
});

test('fullscreen flip drops a reveal; mode always cancels timers', () => {
    let s = run(initialState({ mode: 'fullscreen-hover', fullscreen: true }), { type: 'reveal-now' }).state;
    eq(visible(s), true);
    s = set(s, { fullscreen: false });
    eq(s.revealed, false);
    s = run(initialState(), { type: 'reveal-now' }).state;
    const r = run(s, { type: 'set', patch: { mode: 'always' } });
    eq(r.effects, [{ type: 'cancel', name: 'hide' }]);
});

test('edge events are ignored in always mode', () => {
    const r = run(initialState({ mode: 'always' }), { type: 'edge-pressure' });
    eq(r.effects, []);
    eq(r.state.edgePending, false);
});

test('step does not mutate its input', () => {
    const s = initialState();
    const copy = JSON.stringify(s);
    run(s, { type: 'hold', id: 'x' });
    run(s, { type: 'reveal-now' });
    eq(JSON.stringify(s), copy);
});

// --- edgeSegments
const P = { x: 0, y: 0, width: 1920, height: 1080 };
test('edge: whole width when alone and no hot corner', () =>
    eq(edgeSegments(P, []), [[0, 1920]]));
test('edge: hot corner left (LTR) and right (RTL)', () => {
    eq(edgeSegments(P, [], { hotCornerSize: 32 }), [[32, 1920]]);
    eq(edgeSegments(P, [], { hotCornerSize: 32, rtl: true }), [[0, 1888]]);
});
test('edge: a monitor above splits the run', () =>
    eq(edgeSegments(P, [{ x: 500, y: -1080, width: 800, height: 1080 }]), [[0, 500], [1300, 1920]]));
test('edge: a monitor beside is ignored, one above covering all leaves nothing', () => {
    eq(edgeSegments(P, [{ x: 1920, y: 0, width: 1920, height: 1080 }]), [[0, 1920]]);
    eq(edgeSegments(P, [{ x: -100, y: -1080, width: 3000, height: 1080 }]), []);
});
test('hasMonitorAbove', () => {
    eq(hasMonitorAbove(P, [{ x: 0, y: -1080, width: 1920, height: 1080 }]), true);
    eq(hasMonitorAbove(P, [{ x: 1920, y: 0, width: 1920, height: 1080 }]), false);
});

// --- migration (fake Gio.Settings, same shape as tests/settings.test.js)
function fakeSettings(user) {
    const types = { 'panel-hover-fullscreen': 'b', 'panel-autohide': 'b', 'panel-autohide-fullscreen-only': 'b' };
    const gs = {
        user: { ...user },
        settings_schema: { has_key: k => k in types },
        get_user_value: k => (k in gs.user ? { v: gs.user[k] } : null),
        get_value: k => ({ get_type_string: () => types[k] }),
        get_boolean: k => gs.user[k],
        set_boolean: (k, v) => { gs.user[k] = v; return true; },
    };
    return gs;
}
test('migration: old on keeps fullscreen-only behaviour', () => {
    const gs = fakeSettings({ 'panel-hover-fullscreen': true });
    runMigrations(gs, MIGRATIONS);
    eq([gs.user['panel-autohide'], gs.user['panel-autohide-fullscreen-only']], [true, true]);
});
test('migration: old off turns auto-hide off; idempotent; untouched when never set', () => {
    const gs = fakeSettings({ 'panel-hover-fullscreen': false });
    runMigrations(gs, MIGRATIONS);
    gs.user['panel-autohide'] = true; // user flips it later
    runMigrations(gs, MIGRATIONS);
    eq([gs.user['panel-autohide'], gs.user['panel-autohide-fullscreen-only']], [true, false]);
    const fresh = fakeSettings({});
    runMigrations(fresh, MIGRATIONS);
    eq(fresh.user, {});
});

test('chromeFlagsFor: recorded flags, keys only if present, fallback when untracked', () => {
    const a = {};
    const fb = { affectsStruts: true, trackFullscreen: true };
    eq(chromeFlagsFor([{ actor: a, affectsStruts: false, trackFullscreen: true, affectsInputRegion: true }], a, fb),
        { affectsStruts: false, trackFullscreen: true, affectsInputRegion: true });
    eq(chromeFlagsFor([{ actor: a, affectsStruts: false, trackFullscreen: false }], a, fb),
        { affectsStruts: false, trackFullscreen: false });
    eq(chromeFlagsFor([], a, fb), fb);
    eq(chromeFlagsFor(undefined, a, fb), fb);
});

print(failed ? `${failed} FAILED` : 'all passed');
if (failed)
    imports.system.exit(1);
