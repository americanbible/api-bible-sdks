// Install the packed tarball into a throwaway project, the way a consumer would,
// and check that the BUILT ESM and CJS entry points load and work: the exports
// resolve, the core is one shared copy (so `instanceof NotFoundError` holds
// across the two packages), and a hook renders through the real bundle.
//
// The unit tests import `src/`; this is the only check on what npm ships.
//
// Usage: node scripts/smoke-test.mjs [path/to/package.tgz]
//   With no argument, packs the current package first. The release workflow
//   passes the exact tarball it is about to publish.
// Env:   SMOKE_REACT_VERSION — React major to install (default: 19).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const pkgDir = new URL('..', import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('package.json', pkgDir), 'utf8'));
const coreRange = pkg.peerDependencies['@americanbible/api-bible-sdk'];
const reactVersion = process.env.SMOKE_REACT_VERSION ?? '19';

const dir = mkdtempSync(join(tmpdir(), 'api-bible-react-smoke-'));
const run = (cmd, args, cwd = dir) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });

try {
  let tarball = process.argv[2] && resolve(process.argv[2]);
  if (!tarball) {
    const out = execFileSync('npm', ['pack', '--json', '--pack-destination', dir], { cwd: pkgDir, encoding: 'utf8' });
    tarball = join(dir, JSON.parse(out)[0].filename);
  }

  writeFileSync(join(dir, 'package.json'), JSON.stringify({ private: true, name: 'smoke' }));
  // The core comes from the registry at the peer range — what a consumer gets.
  run('npm', [
    'install', '--no-audit', '--no-fund', '--no-package-lock',
    tarball, `@americanbible/api-bible-sdk@${coreRange}`, `react@${reactVersion}`, `react-dom@${reactVersion}`,
  ]);

  // Same assertions for both module systems; only the imports differ.
  const body = `
assert.equal(typeof sdk.ApiBibleProvider, 'function');
assert.equal(typeof sdk.useBooks, 'function');
assert.equal(sdk.NotFoundError, core.NotFoundError, 'the core must be a single shared copy');
function Books() {
  return createElement('span', null, sdk.useBooks('bba9f40183526463-01').status);
}
const client = { books: { list: () => new Promise(() => {}) } };
const html = renderToString(createElement(sdk.ApiBibleProvider, { client }, createElement(Books)));
assert.match(html, /loading/);
`;
  writeFileSync(
    join(dir, 'check.mjs'),
    `import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import * as sdk from '@americanbible/api-bible-sdk-react';
import * as core from '@americanbible/api-bible-sdk';
${body}
console.log('ESM entry OK');
`,
  );
  writeFileSync(
    join(dir, 'check.cjs'),
    `const assert = require('node:assert/strict');
const { createElement } = require('react');
const { renderToString } = require('react-dom/server');
const sdk = require('@americanbible/api-bible-sdk-react');
const core = require('@americanbible/api-bible-sdk');
${body}
console.log('CJS entry OK');
`,
  );
  run('node', ['check.mjs']);
  run('node', ['check.cjs']);
  console.log(`Smoke test passed (React ${reactVersion}).`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
