import { defineConfig } from 'tsdown';

// Authored as `.js` (not `.ts`) so the config loads as plain ESM on every
// supported Node version. `defineConfig` still type-checks the options object
// in-editor, so nothing is lost by dropping the `.ts` extension.
//
// NOTE: tsdown is pinned to ~0.21.x in package.json. 0.22+ requires Node
// 22.18+ (we target Node 20) and makes `unrun` — the package it uses to load
// this config — an *optional* peer dependency that npm won't install, so the
// build dies with "Failed to import module 'unrun'". 0.21.x bundles `unrun`
// as a real dependency and supports Node 20.19+. Do not bump to 0.22+ without
// also raising the Node floor.
//
// Dual-publish ESM + CJS from a single ESM-authored source. tsdown (Rolldown +
// Oxc) resolves the NodeNext `.js` import specifiers internally and emits:
//   index.js   + index.d.ts   (ESM, matched by the `import` export condition)
//   index.cjs  + index.d.cts  (CJS, matched by the `require` condition)
// zod stays external (it's a runtime dependency, so tsdown leaves it unbundled).
//
// `outExtensions` pins the ESM output to `.js` (not tsdown's `.mjs` default) so
// the published filenames — and therefore package.json's exports/main/module/
// types — stay byte-for-byte stable and match the declared entry points. The
// `.d.ts`/`.d.cts` declaration extensions track the `js` extension automatically.
//
// clean/dts/target are tsdown defaults given our package.json (engines.node,
// types), but we set them explicitly so the build contract doesn't drift if a
// future tsdown changes a default.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node20',
  // Rolldown names the ESM format `'es'` (not `'esm'`), so key off `'cjs'` to
  // stay correct whatever the ESM label is — matching `=== 'esm'` would collide
  // both formats onto `.cjs`.
  outExtensions: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.js' }),
});
