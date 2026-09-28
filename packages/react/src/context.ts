import { createContext } from 'react';
import type { BibleClient } from '@americanbible/api-bible-sdk';
import type { SettledObserver } from './types.js';

/**
 * What the provider shares: the one {@link BibleClient}, plus the `onSettled`
 * observer held in a ref so it can change after mount (unlike `config`, which is
 * read once) without changing the context value's identity.
 */
export interface ApiBibleContextValue {
  client: BibleClient;
  onSettled: { current: SettledObserver | undefined };
}

/**
 * `null` is the "no provider mounted" sentinel, so {@link useApiBible} can throw
 * a helpful error instead of handing back `undefined`.
 *
 * Kept in its own module (rather than inside provider.tsx) so the provider and
 * the accessor hook can both import it without a circular dependency.
 */
export const ApiBibleContext = createContext<ApiBibleContextValue | null>(null);
