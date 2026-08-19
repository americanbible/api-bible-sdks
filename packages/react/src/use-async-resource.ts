import { useCallback, useEffect, useRef, useState } from 'react';
import { BibleError, type BibleClient } from '@americanbible/api-bible-sdk';
import { stableStringify } from './stable-stringify.js';
import { useApiBible } from './use-api-bible.js';
import type { AsyncResource } from './types.js';

// One state object per request. A single `setState` per transition keeps
// isLoading / data / error mutually consistent in every render — there is no
// window where two independent `useState` values disagree.
type State<T> =
  | { status: 'idle'; data: undefined; error: undefined }
  | { status: 'loading'; data: T | undefined; error: undefined } // keeps last data during refetch
  | { status: 'success'; data: T; error: undefined }
  | { status: 'error'; data: T | undefined; error: BibleError }; // keeps last-good data through a failed refetch

export interface UseAsyncResourceOptions {
  /** When false, the hook stays idle and issues no request. Default: `true`. */
  enabled?: boolean;
  /**
   * Stable identifier for the *operation* (e.g. `'books.list'`). When set,
   * concurrent calls with the same `resourceKey` + `deps` under the same client
   * share ONE in-flight request instead of each firing their own network call.
   *
   * It must be unique per endpoint: several hooks produce identical `deps` —
   * e.g. `useVerses` and `useSectionsForChapter` both key on `[bibleId,
   * chapterId]` — so the operation name is what keeps their shared requests from
   * cross-wiring. Omit to opt out of de-duplication (each call gets its own
   * request).
   */
  resourceKey?: string;
  /**
   * Wait this many milliseconds after the inputs settle before issuing the
   * request. A burst of `deps` changes (e.g. search-as-you-type) collapses to a
   * single request for the final value; the intermediate ones are cancelled
   * before they fire. `0`/omitted fires immediately. The timer is cleared on
   * unmount and on any further `deps` change.
   */
  debounceMs?: number;
}

// --- In-flight request de-duplication --------------------------------------
//
// Registry of requests currently in flight, so N components asking for the same
// thing at the same time issue ONE network call. Scoped per client via a
// WeakMap: different providers (hence different clients) never share, and the
// whole table is garbage-collected with the client. IN-FLIGHT ONLY — an entry is
// evicted the moment its request settles, so there is no cache, no staleness
// window, and no unbounded growth.

interface Inflight {
  promise: Promise<unknown>;
  controller: AbortController;
  refs: number; // subscribers currently awaiting this shared request
}

const inflightByClient = new WeakMap<BibleClient, Map<string, Inflight>>();

function inflightMapFor(client: BibleClient): Map<string, Inflight> {
  let map = inflightByClient.get(client);
  if (!map) {
    map = new Map();
    inflightByClient.set(client, map);
  }
  return map;
}

// Call `run`, turning a *synchronous* throw (several SDK methods validate
// arguments eagerly) into a rejected promise so a single code path — the
// awaiting consumer's try/catch — handles both failure modes. This is why the
// engine can call `run` at acquire time rather than inside the async IIFE.
function runToPromise(
  run: (client: BibleClient, signal: AbortSignal) => Promise<unknown>,
  client: BibleClient,
  signal: AbortSignal,
): Promise<unknown> {
  try {
    return run(client, signal);
  } catch (err) {
    return Promise.reject(err);
  }
}

interface Subscription {
  promise: Promise<unknown>;
  isAborted: () => boolean;
  /**
   * Called on unmount / deps change: drop this subscriber, cancelling the
   * underlying request only once nobody is left waiting for it.
   */
  release: () => void;
}

// Join an in-flight request for `(client, key)`, or start (and register) one.
// When `key` is undefined the caller opted out of de-dup and gets a private
// request with unconditional cancellation.
function acquire(
  client: BibleClient,
  key: string | undefined,
  run: (client: BibleClient, signal: AbortSignal) => Promise<unknown>,
): Subscription {
  if (key === undefined) {
    const controller = new AbortController();
    return {
      promise: runToPromise(run, client, controller.signal),
      isAborted: () => controller.signal.aborted,
      release: () => controller.abort(),
    };
  }

  const map = inflightMapFor(client);
  let entry = map.get(key);
  if (!entry) {
    const controller = new AbortController();
    const created: Inflight = {
      promise: runToPromise(run, client, controller.signal),
      controller,
      refs: 0,
    };
    // Evict on settle (success OR failure), but only if this exact entry is
    // still the registered one — a later request under the same key may have
    // replaced it. `.then(evict, evict)` also *handles* the rejection on this
    // branch, so sharing never produces an unhandled-rejection warning.
    const evict = () => {
      if (map.get(key) === created) map.delete(key);
    };
    created.promise.then(evict, evict);
    map.set(key, created);
    entry = created;
  }

  const shared = entry;
  shared.refs += 1;
  return {
    promise: shared.promise,
    isAborted: () => shared.controller.signal.aborted,
    release: () => {
      shared.refs -= 1;
      // Cancel the network call only when the last subscriber leaves AND this
      // entry is still current (guards against aborting a replacement).
      if (shared.refs <= 0 && map.get(key) === shared) {
        map.delete(key);
        shared.controller.abort();
      }
    },
  };
}

/**
 * The single place fetching lifecycle lives; every resource hook wraps this.
 *
 * Responsibilities (implemented once, inherited by every resource hook):
 *  - run the request on mount and whenever `deps` change
 *  - expose `{ data, error, status, isLoading, isFetching, refetch }`
 *  - de-duplicate concurrent identical requests (opt in with `resourceKey`)
 *  - cancel the in-flight request on unmount / deps change (AbortController),
 *    once no other subscriber still needs it
 *  - ignore stale or aborted results (a slow response can't clobber a newer one)
 *  - treat cancellation as a non-event (never surfaced as `error`)
 *  - turn a *synchronous* SDK throw into `error` state, not a render crash
 *
 * This is the extensibility SEAM: replace the body with a cache-aware or
 * TanStack-Query-backed implementation and no resource hook has to change.
 *
 * Writing a resource hook — invariants this file relies on (convention, not
 * enforced, so honor them when copy-pasting an existing hook):
 *  1. `run` is intentionally NOT an effect dependency, so EVERY input `run` reads
 *     that should re-fetch when it changes MUST appear in `deps`. An input the
 *     closure uses but omits from `deps` goes stale (you fetch with an old
 *     argument). When unsure, add it to `deps`.
 *  2. Keep `deps` stable primitives. Serialize any params object with
 *     `stableStringify(params ?? {})` (as every params-bearing hook does) — a raw
 *     object is a fresh reference each render and would re-fetch on every render.
 *  3. Give each hook a `resourceKey` unique to its endpoint; the convention is the
 *     SDK operation path (`'books.list'`, `'verses.get'`), unique by construction.
 *     Same key + same `deps` share a request, so a duplicated key cross-wires two
 *     endpoints.
 *
 * @param run   Calls the SDK; receives the shared client and an AbortSignal.
 * @param deps  Values that, when changed, re-run the request (like effect deps);
 *              must include every input `run` reads (invariant 1 above).
 */
export function useAsyncResource<T>(
  run: (client: BibleClient, signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
  options: UseAsyncResourceOptions = {},
): AsyncResource<T> {
  const client = useApiBible();
  const { enabled = true, resourceKey, debounceMs } = options;

  const [state, setState] = useState<State<T>>(() =>
    enabled
      ? { status: 'loading', data: undefined, error: undefined }
      : { status: 'idle', data: undefined, error: undefined },
  );

  // A monotonically increasing counter is the simplest way to force a re-run
  // on demand without the caller having to change `deps`.
  const [nonce, setNonce] = useState(0);
  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  // The `nonce` the effect last ran for. Comparing it to the current `nonce`
  // tells a refetch() (nonce bumped) apart from a deps/client change — a forced
  // refetch must bypass in-flight de-dup so it can't silently rejoin a sibling's
  // already-running request (which would make refetch a no-op network-wise).
  const lastRunNonce = useRef(nonce);

  useEffect(() => {
    // A refetch() bumped `nonce` since the last run → force a fresh network call
    // (bypass de-dup below). A deps/client change is not "forced": it should still
    // share an in-flight request. Consume the nonce on every run, including the
    // disabled branch, so a refetch fired while disabled doesn't force a later fetch.
    const forced = lastRunNonce.current !== nonce;
    lastRunNonce.current = nonce;

    if (!enabled) {
      // Return `prev` when already idle so React bails out of the update instead of
      // re-rendering on a fresh-but-equal idle object — otherwise a disabled hook
      // whose deps keep changing (e.g. a search box while the query is still blank)
      // re-renders on every keystroke.
      setState((prev) =>
        prev.status === 'idle' ? prev : { status: 'idle', data: undefined, error: undefined },
      );
      return;
    }

    let active = true; // stale-guard: cleanup flips this before the promise settles
    let sub: Subscription | undefined;

    // Issue the request and flip to loading. Deferred behind `debounceMs` when
    // set, so we don't flash `loading` (or fetch) on every keystroke — only the
    // final value in a burst survives, because each intervening effect clears the
    // timer in its cleanup before it fires.
    const fire = () => {
      // Functional update so a refetch keeps the previously-loaded data visible.
      setState((prev) => ({ status: 'loading', data: prev.data, error: undefined }));

      // Share one in-flight request across identical (resourceKey + deps) callers.
      // A forced refetch opts out (undefined key → private request) so it always
      // issues a fresh call instead of rejoining whatever is already in flight.
      // `stableStringify` keeps the key independent of object key order in `deps`.
      const key =
        forced || resourceKey === undefined ? undefined : `${resourceKey}:${stableStringify(deps)}`;
      const acquired = acquire(client, key, run);
      sub = acquired;

      void (async () => {
        try {
          const data = (await acquired.promise) as T;
          if (active) setState({ status: 'success', data, error: undefined });
        } catch (err) {
          // Cancellation is expected on unmount / deps change — swallow it.
          if (!active || acquired.isAborted()) return;
          const error = err instanceof BibleError ? err : new BibleError(String(err), err);
          // Keep the last-good `data` visible through a failed refetch.
          setState((prev) => ({ status: 'error', data: prev.data, error }));
        }
      })();
    };

    let timer: ReturnType<typeof setTimeout> | undefined;
    if (debounceMs && debounceMs > 0) {
      timer = setTimeout(fire, debounceMs);
    } else {
      fire();
    }

    return () => {
      active = false;
      if (timer !== undefined) clearTimeout(timer); // drop a still-pending debounce
      sub?.release(); // drops our ref; aborts the fetch only if nobody else waits
    };
    // `run` is a fresh closure every render by design; its real inputs live in
    // `deps` (see the hook-authoring contract in the JSDoc above), so we spread
    // `deps` and deliberately omit `run`. Omitting an input from `deps` is a
    // stale-closure bug, not a lint false positive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, enabled, nonce, resourceKey, debounceMs, ...deps]);

  return {
    data: state.data,
    error: state.error,
    status: state.status,
    // First-load only: a refetch keeps prior `data`, so it reports `isFetching`
    // (below) but NOT `isLoading` — a `if (isLoading) …` spinner won't flash
    // over content that's already on screen.
    isLoading: state.status === 'loading' && state.data === undefined,
    // Any request in flight, including a background refetch.
    isFetching: state.status === 'loading',
    refetch,
  };
}
