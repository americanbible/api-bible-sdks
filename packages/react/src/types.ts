import type { BibleClientConfig, BibleError } from '@americanbible/api-bible-sdk';

/**
 * The uniform result every resource hook returns. Field names deliberately
 * mirror common data-fetching libraries (`data` / `error` / `status` /
 * `isLoading` / `isFetching` / `refetch`) so that if a later version swaps the
 * internal fetch engine for a caching library (e.g. TanStack Query), this
 * public contract does not change.
 */
export interface AsyncResource<T> {
  /** The unwrapped response payload, or `undefined` until it resolves. */
  data: T | undefined;
  /** A typed SDK error, or `undefined`. Cancellations are never surfaced here. */
  error: BibleError | undefined;
  /**
   * The request lifecycle state:
   * - `'idle'`    — disabled (`enabled: false`); no request has been issued.
   * - `'loading'` — a request is in flight.
   * - `'success'` — the most recent request resolved; `data` is populated.
   * - `'error'`   — the most recent request rejected; `error` is populated.
   */
  status: 'idle' | 'loading' | 'success' | 'error';
  /**
   * True only on the FIRST load, while there is no `data` yet. A background
   * `refetch` (when `data` is already present) leaves this `false`, so
   * `if (isLoading) return <Spinner/>` never flashes over already-rendered
   * content. Equivalent to `status === 'loading' && data === undefined`.
   */
  isLoading: boolean;
  /**
   * True whenever a request is in flight — including a `refetch` refreshing
   * data already on screen. Pair with `data` for stale-while-revalidate UIs
   * (e.g. dim the current content while `isFetching`). Equivalent to
   * `status === 'loading'`.
   */
  isFetching: boolean;
  /**
   * Imperatively re-run the request. Always issues a fresh network call: a
   * refetch bypasses in-flight de-duplication, so it never silently rejoins a
   * request another component already has in flight.
   */
  refetch: () => void;
}

/**
 * Provider configuration: the core SDK's {@link BibleClientConfig}, except
 * `apiKey` is OPTIONAL. Omit it to run in proxy mode — point `baseUrl` at your
 * own backend and let the server hold the real key. When provided, the key is
 * used directly (appropriate server-side; discouraged in the browser).
 */
export type ApiBibleConfig = Omit<BibleClientConfig, 'apiKey'> & { apiKey?: string };
