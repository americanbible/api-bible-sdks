import { describe, it, expect, vi } from 'vitest';
import { Component, type ReactNode } from 'react';
import { render, renderHook } from '@testing-library/react';
import type { BibleClient } from '@americanbible/api-bible-sdk';
import { ApiBibleProvider } from '../src/provider.js';
import { useApiBible } from '../src/use-api-bible.js';

function fakeClient(): BibleClient {
  return { books: { list: vi.fn() } } as unknown as BibleClient;
}

// Minimal boundary so we can assert the render-time throw reliably across React
// 18 minors (a bare `renderHook` throw isn't guaranteed to surface synchronously).
class ErrorBoundary extends Component<
  { onError: (e: Error) => void; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    this.props.onError(error);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

describe('ApiBibleProvider + useApiBible', () => {
  it('provides a pre-built client via the `client` prop', () => {
    const client = fakeClient();
    const { result } = renderHook(() => useApiBible(), {
      wrapper: ({ children }) => <ApiBibleProvider client={client}>{children}</ApiBibleProvider>,
    });
    expect(result.current).toBe(client);
  });

  it('builds a real client from `config` in proxy mode (no apiKey required)', () => {
    const { result } = renderHook(() => useApiBible(), {
      wrapper: ({ children }) => (
        <ApiBibleProvider config={{ baseUrl: 'https://proxy.example/api/bible' }}>
          {children}
        </ApiBibleProvider>
      ),
    });
    // A real BibleClient exposes the resource handles.
    expect(result.current.books).toBeDefined();
    expect(typeof result.current.books.list).toBe('function');
  });

  it('throws when used outside a provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let caught: Error | undefined;
    function Probe() {
      useApiBible();
      return null;
    }
    render(
      <ErrorBoundary onError={(e) => (caught = e)}>
        <Probe />
      </ErrorBoundary>,
    );
    expect(caught?.message).toMatch(/within an <ApiBibleProvider>/);
    spy.mockRestore();
  });

  it('warns in dev when a real key is used against the default baseUrl in a browser', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderHook(() => useApiBible(), {
      wrapper: ({ children }) => (
        <ApiBibleProvider config={{ apiKey: 'real-key-123' }}>{children}</ApiBibleProvider>
      ),
    });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('exposes it in your bundle'));
    spy.mockRestore();
  });

  it('does not warn in proxy mode', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderHook(() => useApiBible(), {
      wrapper: ({ children }) => (
        <ApiBibleProvider config={{ baseUrl: 'https://proxy.example/api/bible' }}>
          {children}
        </ApiBibleProvider>
      ),
    });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('warns in dev when the config/client prop changes after mount', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { rerender } = render(
      <ApiBibleProvider config={{ baseUrl: 'https://a.example/api' }}>
        <div />
      </ApiBibleProvider>,
    );
    expect(spy).not.toHaveBeenCalled();

    // baseUrl changed — the already-built client won't pick it up, so warn.
    rerender(
      <ApiBibleProvider config={{ baseUrl: 'https://b.example/api' }}>
        <div />
      </ApiBibleProvider>,
    );
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('built once'));
    spy.mockRestore();
  });

  it('does not warn when the config prop is a fresh object with unchanged values', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { rerender } = render(
      <ApiBibleProvider config={{ baseUrl: 'https://a.example/api' }}>
        <div />
      </ApiBibleProvider>,
    );
    // New inline object each render, same values — value comparison must not
    // mistake it for a real change (that would warn on every render).
    rerender(
      <ApiBibleProvider config={{ baseUrl: 'https://a.example/api' }}>
        <div />
      </ApiBibleProvider>,
    );
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
