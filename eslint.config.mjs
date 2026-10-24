const nodeGlobals = Object.fromEntries(
  Object.getOwnPropertyNames(globalThis).map((key) => [key, 'readonly']),
);
const browserGlobals = Object.fromEntries(
  `window document navigator location localStorage indexedDB matchMedia requestAnimationFrame
  cancelAnimationFrame innerWidth innerHeight scrollX scrollY scrollTo Image FileReader
  HTMLElement HTMLInputElement HTMLSelectElement MutationObserver ResizeObserver CSS
  getComputedStyle devicePixelRatio performance alert confirm addEventListener createImageBitmap Storage`
    .split(/\s+/)
    .map((key) => [key, 'readonly']),
);
export default [
  {
    ignores: [
      'node_modules/**',
      'dist/assets/**',
      'test-results/**',
      'playwright-report/**',
      'var/**',
      'backups/**',
    ],
  },
  {
    files: [
      'dist/**/*.{js,mjs}',
      'server/**/*.cjs',
      'scripts/**/*.cjs',
      'tests/**/*.cjs',
      '*.cjs',
      '*.mjs',
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        ...nodeGlobals,
        ...browserGlobals,
        require: 'readonly',
        module: 'readonly',
        __dirname: 'readonly',
        Buffer: 'readonly',
        process: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
      'no-unreachable': 'error',
      'no-dupe-args': 'error',
      'no-dupe-keys': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-async-promise-executor': 'error',
      'no-unexpected-multiline': 'error',
      'no-const-assign': 'error',
      'no-func-assign': 'error',
      'no-invalid-regexp': 'error',
      'no-unsafe-finally': 'error',
      'no-sparse-arrays': 'error',
    },
  },
];
