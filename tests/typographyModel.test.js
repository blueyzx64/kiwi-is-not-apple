// Run: gjs -m tests/typographyModel.test.js
import {
    HIDPI_SUBPIXEL, MACOS_RENDERING, SMOOTHING, STANDARD_GRAYSCALE, STANDARD_RENDERING, UI_FAMILIES, fontSize, parseFcList, pickFamily, plan,
    renderingFor, withFamily,
} from '../features/typography/model.js';

let failed = 0;
function test(name, fn) {
    try { fn(); print(`ok   ${name}`); } catch (e) { failed++; print(`FAIL ${name}: ${e.message}`); }
}
function eq(a, b) {
    const ja = JSON.stringify(a), jb = JSON.stringify(b);
    if (ja !== jb)
        throw new Error(`expected ${jb}, got ${ja}`);
}

test('fc-list output: one family per name, localized names split', () => {
    eq(parseFcList('Adwaita Sans\nInter Variable,Inter Variable Text\n\nDejaVu Sans\nAdwaita Sans\n'),
        ['Adwaita Sans', 'Inter Variable', 'Inter Variable Text', 'DejaVu Sans']);
    eq(parseFcList(''), []);
    eq(parseFcList(null), []);
    eq(parseFcList('Noto Sans CJK\\-JP'), ['Noto Sans CJK-JP']);
});

test('SF Pro wins over Inter; the installed spelling is kept', () => {
    eq(pickFamily(['Inter Variable', 'SF Pro'], ['SF Pro', 'Inter Variable']), 'SF Pro');
    eq(pickFamily(['inter variable'], ['SF Pro', 'Inter Variable']), 'inter variable');
    eq(pickFamily(['Adwaita Sans'], ['SF Pro', 'Inter Variable']), null);
    eq(pickFamily(undefined, ['SF Pro']), null);
});

test('the plan: UI and mono families from what is installed', () => {
    eq(plan(['Adwaita Sans', 'Adwaita Mono']), { ui: null, mono: null });
    eq(plan(['Inter', 'Inter Variable']), { ui: 'Inter Variable', mono: null });
    eq(plan(['SF Pro Text', 'SF Mono', 'Inter']), { ui: 'SF Pro Text', mono: 'SF Mono' });
});

test('the user\'s size is kept, styles in the family dropped', () => {
    eq(fontSize('Adwaita Sans 11'), 11);
    eq(fontSize('Cantarell Bold 10.5'), 10.5);
    eq(fontSize('Inter'), null);
    eq(fontSize('Inter 14px'), null);
    eq(withFamily('Adwaita Sans 11', 'Inter Variable', 11), 'Inter Variable 11');
    eq(withFamily('Cantarell Bold 12.5', 'SF Pro', 11), 'SF Pro 12.5');
    eq(withFamily('', 'SF Mono', 10), 'SF Mono 10');
});

test('macOS rendering: unhinted, grayscale', () => {
    eq(MACOS_RENDERING, { 'font-hinting': 'none', 'font-antialiasing': 'grayscale' });
});

test('UI font: SF Pro Text (the small optical size) before the SF Pro variable font', () => {
    eq(UI_FAMILIES[0], 'SF Pro Text');
    eq(plan(['SF Pro', 'SF Pro Display', 'SF Pro Text', 'Inter Variable']).ui, 'SF Pro Text');
    eq(plan(['SF Pro', 'SF Pro Display', 'Inter Variable']).ui, 'SF Pro');
    eq(plan(['SF Pro Display', 'Inter Variable']).ui, 'Inter Variable');
});

test('Automatic: slight + subpixel at scale 1, unhinted grayscale on HiDPI', () => {
    eq(STANDARD_RENDERING, { 'font-hinting': 'slight', 'font-antialiasing': 'rgba' });
    const low = renderingFor({ scales: [1] });
    eq([low.hinting, low.antialiasing, low.dpi, low.hidpi], ['slight', 'rgba', 96, false]);
    eq(low.values, STANDARD_RENDERING);
    const hi = renderingFor({ scales: [2] });
    eq([hi.hinting, hi.antialiasing, hi.dpi, hi.hidpi], ['none', 'grayscale', 192, true]);
    eq(hi.values, MACOS_RENDERING);
    // Fractional: 1.25 is a standard screen, 1.5 and up HiDPI
    eq(renderingFor({ scales: [1.25] }).hinting, 'slight');
    eq(renderingFor({ scales: [1.5] }).hinting, 'none');
    eq(renderingFor({ scales: [1.75] }).antialiasing, 'grayscale');
    // Same tables every time: the adapter compares them by identity
    if (renderingFor({ scales: [1] }).values !== renderingFor({ scales: [1.25] }).values)
        throw new Error('values must be the shared frozen table');
});

test('Font Smoothing: subpixel and grayscale force the antialiasing, hinting follows density', () => {
    eq(renderingFor({ scales: [1], smoothing: 'grayscale' }).values, STANDARD_GRAYSCALE);
    eq(renderingFor({ scales: [2], smoothing: 'grayscale' }).values, MACOS_RENDERING);
    eq(renderingFor({ scales: [1], smoothing: 'subpixel' }).values, STANDARD_RENDERING);
    eq(renderingFor({ scales: [2], smoothing: 'subpixel' }).values, HIDPI_SUBPIXEL);
    eq(renderingFor({ scales: [1], smoothing: 'bogus' }).values, STANDARD_RENDERING);
    eq(renderingFor({ scales: [2], smoothing: undefined }).values, MACOS_RENDERING);
    eq(SMOOTHING, ['automatic', 'subpixel', 'grayscale']);
});

test('rendering: the least dense monitor decides; text scaling counts as density', () => {
    eq(renderingFor({ scales: [2, 1] }).hinting, 'slight');
    eq(renderingFor({ scales: [2, 1.5] }).hinting, 'none');
    eq(renderingFor({ scales: [1], textScale: 1.25 }).hinting, 'slight');
    eq(renderingFor({ scales: [1], textScale: 1.5 }).hinting, 'none');
    eq(renderingFor({ scales: [1.25], textScale: 1.25 }).dpi, 150);
});

test('rendering: no or bad input falls back to a standard screen', () => {
    eq(renderingFor({ scales: [] }).hinting, 'slight');
    eq(renderingFor({}).hinting, 'slight');
    eq(renderingFor().hinting, 'slight');
    eq(renderingFor({ scales: [0, NaN, -1] }).dpi, 96);
    eq(renderingFor({ scales: [2], textScale: 0 }).dpi, 192);
});

if (failed) {
    print(`${failed} failed`);
    imports.system.exit(1);
}
