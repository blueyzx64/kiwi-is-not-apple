// SPDX-License-Identifier: GPL-3.0-or-later
// Press and hold for accents: the variants macOS (English, US) offers per letter, in its order.
// The number under each variant in the macOS popup is its index + 1. Pure.
//
// Order: the macOS en-US accent menu. 'g' is not in that menu; its row (ğ ġ ģ) follows the
// Turkish / Maltese / Latvian layouts and is marked as Kiwi's addition.

const LOWER = Object.freeze({
    a: ['à', 'á', 'â', 'ä', 'æ', 'ã', 'å', 'ā'],
    c: ['ç', 'ć', 'č'],
    e: ['è', 'é', 'ê', 'ë', 'ē', 'ė', 'ę'],
    g: ['ğ', 'ġ', 'ģ'],     // Kiwi addition (not in the macOS en-US menu)
    i: ['î', 'ï', 'í', 'ī', 'į', 'ì'],
    l: ['ł'],
    n: ['ñ', 'ń'],
    o: ['ô', 'ö', 'ò', 'ó', 'œ', 'ø', 'ō', 'õ'],
    s: ['ß', 'ś', 'š'],
    u: ['û', 'ü', 'ù', 'ú', 'ū'],
    y: ['ÿ'],
    z: ['ž', 'ź', 'ż'],
});

// Upper case: the same order; ß has no single-letter capital in the macOS menu, so S drops it
const UPPER = Object.freeze(Object.fromEntries(Object.entries(LOWER).map(([k, v]) => [
    k.toUpperCase(), v.filter(c => c !== 'ß').map(c => c.toUpperCase()),
])));

export const MAX_VARIANTS = 9;

/** The accent variants of one typed character, in menu order (empty when it has none). */
export function variantsFor(ch) {
    if (typeof ch !== 'string' || ch.length !== 1)
        return [];
    return (LOWER[ch] ?? UPPER[ch] ?? []).slice(0, MAX_VARIANTS);
}

/** Every character that has variants (for tests and the engine's quick check). */
export function accentedLetters() {
    return [...Object.keys(LOWER), ...Object.keys(UPPER)];
}

/** The variant a digit key picks ('1'..'9'), or null. */
export function pickByDigit(variants, digit) {
    const n = Number(digit);
    if (!Number.isInteger(n) || n < 1 || n > variants.length)
        return null;
    return variants[n - 1];
}
