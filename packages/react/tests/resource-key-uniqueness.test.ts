// @vitest-environment node
//
// This meta-test reads source files off disk, so it runs in the Node environment.
// The suite default is jsdom, which sets import.meta.url to an http: URL that
// fileURLToPath rejects; this test renders nothing, so it needs no DOM.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Enforces the dedup invariant documented in `use-async-resource.ts`: every hook's
// `resourceKey` must be unique to its endpoint. The in-flight request cache keys on
// `resourceKey:stableStringify(deps)`, so two hooks that shared a key AND produced
// identical deps would cross-wire — one hook could receive the other's payload.
// This turns that convention into a fail-loud CI check: add a hook with a duplicate
// key (or copy-paste one and forget to change it) and this test goes red.
//
// It scans source for `resourceKey: '<literal>'` — the established style. A hook
// that assigns its key from a variable instead would slip the scan and drop the
// found-count below the floor asserted below, which also fails.
const srcDir = fileURLToPath(new URL('../src', import.meta.url));
const RESOURCE_KEY_RE = /resourceKey:\s*['"]([^'"]+)['"]/g;

function collectResourceKeys(): { key: string; file: string }[] {
  const found: { key: string; file: string }[] = [];
  for (const file of readdirSync(srcDir)) {
    if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue;
    const content = readFileSync(join(srcDir, file), 'utf8');
    for (const match of content.matchAll(RESOURCE_KEY_RE)) {
      const key = match[1];
      if (key) found.push({ key, file });
    }
  }
  return found;
}

describe('resourceKey uniqueness (dedup invariant)', () => {
  it('assigns a resourceKey unique to every hook', () => {
    const found = collectResourceKeys();

    // Guard against a broken scan silently making the uniqueness check vacuous.
    // 18 resource hooks ship today; the floor grows with the hook surface. If you
    // deliberately remove hooks, lower this number.
    expect(found.length).toBeGreaterThanOrEqual(18);

    const filesByKey = new Map<string, string[]>();
    for (const { key, file } of found) {
      filesByKey.set(key, [...(filesByKey.get(key) ?? []), file]);
    }
    const duplicates = [...filesByKey.entries()].filter(([, files]) => files.length > 1);

    // Empty on success; on failure vitest prints the clashing key(s) and the files
    // that share them.
    expect(duplicates).toEqual([]);
  });
});
