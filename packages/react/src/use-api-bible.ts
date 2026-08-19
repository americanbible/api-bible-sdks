import { useContext } from 'react';
import type { BibleClient } from '@americanbible/api-bible-sdk';
import { ApiBibleContext } from './context.js';

/**
 * Access the shared {@link BibleClient}. This is also the escape hatch: for any
 * endpoint without a dedicated hook, call methods on the returned client
 * directly (optionally inside your own {@link useAsyncResource}-style effect).
 *
 * @throws {Error} if called outside an `<ApiBibleProvider>`.
 */
export function useApiBible(): BibleClient {
  const client = useContext(ApiBibleContext);
  if (client === null) {
    throw new Error('useApiBible must be used within an <ApiBibleProvider>.');
  }
  return client;
}
