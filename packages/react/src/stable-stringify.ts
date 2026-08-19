/**
 * Deterministic `JSON.stringify`: object keys are emitted in sorted order at
 * every depth, so two params objects with the same entries in a different
 * insertion order serialize to an identical string. Arrays keep their order
 * (position is meaningful).
 *
 * Used to build de-dup / effect keys from caller-supplied params. Plain
 * `JSON.stringify` is key-order sensitive, so `{ query, limit }` and
 * `{ limit, query }` would hash differently and miss de-duplication; this makes
 * the key depend on the params' *values*, not how the caller happened to order
 * (or re-order, across renders) their keys — without asking callers to memoize.
 *
 * The api.bible params are plain JSON DTOs (strings, numbers, booleans, null,
 * arrays, nested objects), so `JSON.stringify`'s handling of the exotic cases
 * (`undefined`/functions omitted, `NaN`→`null`) never comes into play here.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    // The replacer runs top-down and re-visits whatever we return, so handing
    // back a key-sorted shallow copy sorts this level; nested objects are sorted
    // when the replacer reaches them on their own pass. Arrays and primitives
    // pass through untouched.
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const obj = val as Record<string, unknown>;
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(obj).sort()) sorted[key] = obj[key];
      return sorted;
    }
    return val;
  });
}
