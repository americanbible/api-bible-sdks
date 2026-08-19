import { defineConfig } from 'tsdown';

// Mirrors packages/typescript/tsdown.config.js. tsdown is pinned to ~0.21.x in
// package.json: 0.22+ requires Node 22.18+ (we target Node 20) and makes its
// config loader `unrun` an optional peer dep npm won't install, breaking the
// build. Do not bump past 0.21.x without also raising the Node floor.
//
// Dual-publish ESM + CJS from a single ESM-authored source:
//   index.js   + index.d.ts   (ESM, matched by the `import` export condition)
//   index.cjs  + index.d.cts  (CJS, matched by the `require` condition)
// react / react-dom and the core SDK are peer dependencies, so tsdown leaves
// them external (unbundled).
//
// `outExtensions` pins the ESM output to `.js` (not tsdown's `.mjs` default) so
// the emitted filenames stay byte-for-byte aligned with package.json's exports.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  outExtensions: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.js' }),
});
