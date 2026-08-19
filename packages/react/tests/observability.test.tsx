import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { BibleClient, BibleClientConfig } from '@americanbible/api-bible-sdk';
import { ApiBibleProvider } from '../src/provider.js';

// Mock ONLY the core client factory so we can assert exactly what config the
// provider forwards to it — the observability seam (onResponse / onRetry) plus
// the transport config. Every other core export the provider touches stays real.
// The generic `vi.fn<[config], client>` types the call so toHaveBeenCalledWith
// accepts a config matcher without an unused parameter.
const createBibleClient = vi.hoisted(() =>
  vi.fn<[BibleClientConfig], BibleClient>(
    () => ({ books: { list: vi.fn() } }) as unknown as BibleClient,
  ),
);

vi.mock('@americanbible/api-bible-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@americanbible/api-bible-sdk')>();
  return { ...actual, createBibleClient };
});

describe('provider forwards observability + transport config to the core client', () => {
  it('passes onResponse / onRetry (and retry / timeout) through unchanged', () => {
    const onResponse = vi.fn();
    const onRetry = vi.fn();

    render(
      <ApiBibleProvider
        config={{
          apiKey: 'test-key',
          baseUrl: 'https://x.example/api',
          onResponse,
          onRetry,
          timeout: 5000,
          retry: { maxAttempts: 4 },
        }}
      >
        <div />
      </ApiBibleProvider>,
    );

    expect(createBibleClient).toHaveBeenCalledTimes(1);
    expect(createBibleClient).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'test-key',
        // Same references — the React layer neither wraps nor intercepts them, so
        // the telemetry callbacks fire exactly as the core documents.
        onResponse,
        onRetry,
        timeout: 5000,
        retry: { maxAttempts: 4 },
      }),
    );
  });

  it('still forwards observers in proxy mode (apiKey omitted -> sentinel injected)', () => {
    createBibleClient.mockClear();
    const onResponse = vi.fn();

    render(
      <ApiBibleProvider config={{ baseUrl: 'https://proxy.example/api', onResponse }}>
        <div />
      </ApiBibleProvider>,
    );

    // The observer rides along with the injected non-secret proxy sentinel key.
    expect(createBibleClient).toHaveBeenCalledWith(
      expect.objectContaining({ onResponse, apiKey: 'proxy' }),
    );
  });
});
