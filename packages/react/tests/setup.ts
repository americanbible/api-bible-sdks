import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Unmount anything a test rendered so DOM and React state don't leak between
// cases (Testing Library's auto-cleanup only registers when Vitest globals are
// enabled, which this package leaves off in favor of explicit imports).
afterEach(() => {
  cleanup();
});
