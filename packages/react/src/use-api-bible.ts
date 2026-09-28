import { useContext } from 'react';
import type { BibleClient } from '@americanbible/api-bible-sdk';
import { ApiBibleContext, type ApiBibleContextValue } from './context.js';

/**
 * Internal: the full provider value (client + telemetry observer). Not exported
 * from the package entry point — consumers use {@link useApiBible}.
 *
 * @throws {Error} if called outside an `<ApiBibleProvider>`.
 */
export function useApiBibleContext(): ApiBibleContextValue {
  const value = useContext(ApiBibleContext);
  if (value === null) {
    throw new Error('useApiBible must be used within an <ApiBibleProvider>.');
  }
  return value;
}

/**
 * Access the shared {@link BibleClient}. This is also the escape hatch: for any
 * endpoint without a dedicated hook, call methods on the returned client
 * directly (optionally inside your own {@link useAsyncResource}-style effect).
 *
 * @throws {Error} if called outside an `<ApiBibleProvider>`.
 */
export function useApiBible(): BibleClient {
  return useApiBibleContext().client;
}
