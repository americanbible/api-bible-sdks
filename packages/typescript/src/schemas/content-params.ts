import { joinIds } from '../resources/_shared.js';

// Shared query parameters for endpoints that return rendered Bible content:
// chapters, verses, passages, and sections. The API accepts the same set of
// render-control flags on all four. Each per-resource params type aliases this
// interface; the resources route through `contentRenderingToQuery` rather than
// each carrying its own copy of the serialization logic.

export interface ContentRenderingParams {
  contentType?: 'html' | 'json' | 'text';
  includeNotes?: boolean;
  includeTitles?: boolean;
  includeChapterNumbers?: boolean;
  includeVerseNumbers?: boolean;
  includeVerseSpans?: boolean;
  parallels?: string[];
}

// Maps each ContentRenderingParams key to its kebab-case wire name. Kept as a
// typed tuple list so the compiler will flag any key that drifts out of sync
// with the interface above.
const BOOLEAN_QUERY_KEYS: ReadonlyArray<[keyof ContentRenderingParams, string]> = [
  ['includeNotes', 'include-notes'],
  ['includeTitles', 'include-titles'],
  ['includeChapterNumbers', 'include-chapter-numbers'],
  ['includeVerseNumbers', 'include-verse-numbers'],
  ['includeVerseSpans', 'include-verse-spans'],
];

export function contentRenderingToQuery(
  params: ContentRenderingParams,
  context: string,
): Record<string, string> | undefined {
  const result: Record<string, string> = {};

  if (params.contentType !== undefined) {
    result['content-type'] = params.contentType;
  }

  for (const [key, queryKey] of BOOLEAN_QUERY_KEYS) {
    const value = params[key];
    if (typeof value === 'boolean') {
      result[queryKey] = value ? 'true' : 'false';
    }
  }

  if (params.parallels !== undefined && params.parallels.length > 0) {
    // `parallels` is comma-joined like `ids[]`, so it carries the same CSV
    // corruption risk: a comma inside an element would silently split it.
    // Route through joinIds for the same early, named guard.
    result['parallels'] = joinIds(params.parallels, context);
  }

  return Object.keys(result).length > 0 ? result : undefined;
}
