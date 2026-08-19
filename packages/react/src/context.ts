import { createContext } from 'react';
import type { BibleClient } from '@americanbible/api-bible-sdk';

/**
 * Holds the one shared {@link BibleClient}. `null` is the "no provider mounted"
 * sentinel, so {@link useApiBible} can throw a helpful error instead of handing
 * back `undefined`.
 *
 * Kept in its own module (rather than inside provider.tsx) so the provider and
 * the accessor hook can both import it without a circular dependency.
 */
export const ApiBibleContext = createContext<BibleClient | null>(null);
