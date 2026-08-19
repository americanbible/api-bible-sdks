import type { Section, SectionGetParams } from '@americanbible/api-bible-sdk';
import { stableStringify } from './stable-stringify.js';
import { useAsyncResource } from './use-async-resource.js';
import type { AsyncResource } from './types.js';

/**
 * Fetch a single section with rendered content (html/text/json), optionally
 * with include-* flags and parallels.
 *
 * Thin by design: maps 1:1 to `client.sections.get`, forwards the abort signal,
 * and unwraps the `{ data }` envelope. All lifecycle/state lives in
 * {@link useAsyncResource} — this mirrors the `usePassages`/`useChapter`
 * template (the single-`get` counterpart to the list hooks
 * {@link useSectionsForBook} / {@link useSectionsForChapter}).
 *
 * @param bibleId    Bible ID. When falsy the hook stays idle (no request).
 * @param sectionId  Section ID. When falsy the hook stays idle.
 * @param params     Optional content-rendering params (contentType, include-*,
 *                   parallels). Shape depends on `contentType`: 'html'/'text'
 *                   yield a string, 'json' an array of content nodes.
 */
export function useSection(
  bibleId: string,
  sectionId: string,
  params?: SectionGetParams,
): AsyncResource<Section> {
  return useAsyncResource<Section>(
    (client, signal) => client.sections.get(bibleId, sectionId, params, signal).then((res) => res.data),
    // stableStringify turns a possibly-new-every-render params object into a
    // stable, key-order-independent string, so callers needn't memoize.
    [bibleId, sectionId, stableStringify(params ?? {})],
    { enabled: Boolean(bibleId && sectionId), resourceKey: 'sections.get' },
  );
}
