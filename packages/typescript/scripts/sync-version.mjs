#!/usr/bin/env node
// Regenerates src/version.ts from package.json "version". Runs automatically
// before every build (via the `prebuild` script) so the SDK's User-Agent
// header always reports the same string as the published version.
//
// Usage:
//   node scripts/sync-version.mjs           # write if changed (no-op if in sync)
//   node scripts/sync-version.mjs --check   # exit non-zero if out of sync (for CI)

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(here, '..', 'package.json');
const versionPath = resolve(here, '..', 'src', 'version.ts');

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

const expected = `// AUTO-GENERATED — do not edit by hand.
// Sourced from package.json "version" by scripts/sync-version.mjs, which runs
// automatically before every build (\`prebuild\` hook). Kept as a const rather
// than a runtime \`import packageJson from '../package.json'\` to avoid uneven
// JSON-import support across Node versions, bundlers, and non-Node runtimes —
// and to keep the published dist/ self-contained.
export const SDK_VERSION = '${pkg.version}';
`;

let current = '';
try {
  current = readFileSync(versionPath, 'utf8');
} catch {
  // First-time generation; current stays empty and we'll write below.
}

const check = process.argv.includes('--check');

if (check) {
  if (current !== expected) {
    process.stderr.write(
      `[sync-version] src/version.ts is out of sync with package.json (${pkg.version}).\n` +
        `Run \`npm run sync-version\` and commit the result.\n`,
    );
    process.exit(1);
  }
  process.exit(0);
}

if (current !== expected) {
  writeFileSync(versionPath, expected);
  process.stdout.write(`[sync-version] wrote SDK_VERSION = '${pkg.version}'\n`);
}
