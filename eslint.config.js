// SPDX-License-Identifier: GPL-3.0-or-later
// Dependency-free flat config. Mirrors gnome-shell's tools/eslint.config.js rule
// set where it does not need eslint-config-gnome (not on npm).
const gjsGlobals = {
    global: 'readonly',
    log: 'readonly',
    logError: 'readonly',
    print: 'readonly',
    printerr: 'readonly',
    imports: 'readonly',
    console: 'readonly',
    window: 'readonly',
    TextEncoder: 'readonly',
    TextDecoder: 'readonly',
    URL: 'readonly',
    URLSearchParams: 'readonly',
    AbortController: 'readonly',
    setTimeout: 'readonly',
    clearTimeout: 'readonly',
    setInterval: 'readonly',
    clearInterval: 'readonly',
    queueMicrotask: 'readonly',
    structuredClone: 'readonly',
    _: 'readonly',
    C_: 'readonly',
    N_: 'readonly',
    ngettext: 'readonly',
};

export default [
    {ignores: ['advanced/**', 'po/**', 'icons/**', 'docs/**', 'node_modules/**']},
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            globals: gjsGlobals,
        },
        linterOptions: {reportUnusedDisableDirectives: 'warn'},
        rules: {
            // correctness
            'no-undef': 'error',
            'no-unused-vars': ['warn', {args: 'none', caughtErrors: 'none'}],
            'no-var': 'error',
            'no-redeclare': 'error',
            'no-dupe-keys': 'error',
            'no-dupe-class-members': 'error',
            'no-unreachable': 'error',
            'no-self-assign': 'error',
            'no-const-assign': 'error',
            'no-shadow-restricted-names': 'error',
            'no-throw-literal': 'error',
            'no-loss-of-precision': 'error',
            'no-prototype-builtins': 'warn',
            'no-empty': ['warn', {allowEmptyCatch: true}],
            'no-useless-escape': 'warn',
            'no-case-declarations': 'warn',
            // gnome-shell house rules
            'consistent-return': 'warn',
            eqeqeq: ['error', 'smart'],
            'prefer-const': ['warn', {destructuring: 'all'}],
            'prefer-arrow-callback': 'warn',
            camelcase: ['warn', {properties: 'never'}],
            // EGO: legacy modules are rejected
            'no-restricted-imports': ['error', {
                patterns: [{group: ['resource:///org/gnome/gjs/modules/*'], message: 'Legacy module; EGO rejects it.'}],
            }],
            'no-restricted-properties': ['error',
                {object: 'imports', property: 'mainloop', message: 'Use GLib.timeout_add.'},
                {object: 'imports', property: 'lang', message: 'Use native classes.'},
                {object: 'imports', property: 'byteArray', message: 'Use TextDecoder.'},
            ],
            // style (4 spaces, single quotes, semicolons; imports spacing left alone)
            semi: ['warn', 'always'],
            quotes: ['warn', 'single', {avoidEscape: true, allowTemplateLiterals: true}],
            indent: 'off',
            'object-curly-spacing': 'off',
        },
    },
    {
        // prefs runs in its own process: no Shell libs, no Shell globals
        files: ['prefs.js', 'apps/*/prefs.js'],
        languageOptions: {globals: {global: 'off'}},
    },
];
