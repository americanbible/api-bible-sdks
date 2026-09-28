import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { createBibleClient, type BibleClient } from '@americanbible/api-bible-sdk';
import { ApiBibleContext, type ApiBibleContextValue } from './context.js';
import type { ApiBibleConfig, SettledObserver } from './types.js';

/**
 * Initialize with EITHER `config` (common path — we build the client) OR a
 * pre-built `client` (tests, SSR, or advanced reuse). Modeled as a union so
 * "both" and "neither" are unrepresentable.
 *
 * `onSettled` receives one {@link SettledEvent} per network request a hook
 * issued. Unlike `config`, it may change after mount; the latest one is used.
 */
export type ApiBibleProviderProps =
  | { config: ApiBibleConfig; client?: never; onSettled?: SettledObserver; children: ReactNode }
  | { client: BibleClient; config?: never; onSettled?: SettledObserver; children: ReactNode };

// Non-blank placeholder that satisfies the core SDK's required-key check in
// proxy mode. Your proxy is expected to overwrite the `api-key` header with the
// real key before forwarding upstream, so this value never leaves your backend.
const PROXY_SENTINEL_KEY = 'proxy';

// The core requires an absolute URL, but a same-origin proxy path
// ('/api/bible') is the natural browser config — resolve it against the page
// origin. During SSR there is no origin; hooks never fetch on the server
// (effects don't run) and the browser builds its own client on hydration, so a
// loopback placeholder just keeps server render from throwing. `//host` is
// protocol-relative, not a path, so it falls through to the core's validation.
function resolveBaseUrl(baseUrl: string | undefined): string | undefined {
  if (baseUrl === undefined || !baseUrl.startsWith('/') || baseUrl.startsWith('//')) return baseUrl;
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
  return new URL(baseUrl, origin).toString();
}

function buildClient(config: ApiBibleConfig): BibleClient {
  const apiKey = config.apiKey && config.apiKey.trim() !== '' ? config.apiKey : PROXY_SENTINEL_KEY;
  return createBibleClient({ ...config, apiKey, baseUrl: resolveBaseUrl(config.baseUrl) });
}

/**
 * Provides one shared {@link BibleClient} to the tree. The client is built once
 * (lazy `useState` initializer), not on every render, so its identity is stable
 * and consumers of the context don't re-render when the provider re-renders.
 */
export function ApiBibleProvider(props: ApiBibleProviderProps): ReactElement {
  // Build the client ONCE. A client is a long-lived singleton; rebuilding it on
  // every render would change its identity (re-rendering every consumer) and
  // drop in-flight requests. To swap clients, remount the provider.
  //
  // Discriminate by value, not `'client' in props`: the union's `?: never`
  // fields make the `in` operator unable to narrow, and this also gives JS
  // callers (who bypass the types) a clear error instead of odd behavior.
  const [client] = useState<BibleClient>(() => {
    if (props.client) return props.client;
    if (props.config) return buildClient(props.config);
    throw new Error('ApiBibleProvider requires either a `config` or a `client` prop.');
  });

  // The observer lives in a ref so a new `onSettled` (e.g. an inline arrow, fresh
  // every render) takes effect without changing the context value's identity —
  // which would re-render every consumer.
  const onSettled = useRef(props.onSettled);
  useEffect(() => {
    onSettled.current = props.onSettled;
  });
  const [value] = useState<ApiBibleContextValue>(() => ({ client, onSettled }));

  // Proxy-first guardrail — dev only, and never throws: warn if a real key is
  // about to be shipped to a browser against the default api.bible host.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const config = props.config;
    if (!config) return;
    const { apiKey, baseUrl } = config;
    const realKey = !!apiKey && apiKey.trim() !== '' && apiKey !== PROXY_SENTINEL_KEY;
    if (realKey && !baseUrl && typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.warn(
        '[api-bible] Using an api.bible key directly in the browser exposes it in your bundle. ' +
          'Prefer a server-side proxy: set `baseUrl` to your backend and omit `apiKey`.',
      );
    }
    // Mount-only: config is read once, at construction time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dev-only guardrail: the client is built once (above), so changing the
  // `config`/`client` prop after mount has no effect. Warn — once — if a caller
  // swaps the client instance, the api-key, the baseUrl, or the init mode, so the
  // silently-ignored change doesn't turn into a head-scratcher. Compared by value
  // (not identity) so an inline `config={{…}}` object, fresh on every render,
  // does not trip it.
  const initialProps = useRef(props);
  const warnedStaleProps = useRef(false);
  const clientProp = props.client;
  const apiKey = props.config?.apiKey;
  const baseUrl = props.config?.baseUrl;
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' || warnedStaleProps.current) return;
    const first = initialProps.current;
    if (clientProp !== first.client || apiKey !== first.config?.apiKey || baseUrl !== first.config?.baseUrl) {
      warnedStaleProps.current = true;
      // eslint-disable-next-line no-console
      console.warn(
        '[api-bible] ApiBibleProvider received a changed `config`/`client` prop after ' +
          'mount, but the client is built once — the new value is ignored. Remount the ' +
          'provider (e.g. give it a `key` that changes) to apply new configuration.',
      );
    }
  }, [clientProp, apiKey, baseUrl]);

  return <ApiBibleContext.Provider value={value}>{props.children}</ApiBibleContext.Provider>;
}
