import { afterEach, describe, it, expect, vi } from 'vitest';
import { isProduction } from '../src/env.js';

describe('isProduction', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('reads NODE_ENV', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(isProduction()).toBe(true);
    vi.stubEnv('NODE_ENV', 'development');
    expect(isProduction()).toBe(false);
  });

  it('treats an environment with no `process` (unbundled browser) as development instead of throwing', () => {
    vi.stubGlobal('process', undefined);
    // Evaluate before restoring: the stub must be in place for the call itself.
    const result = isProduction();
    vi.unstubAllGlobals();
    expect(result).toBe(false);
  });
});
