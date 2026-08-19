import { InvalidInputError } from '../http/errors.js';

/**
 * Serializes an `ids[]` filter into the comma-separated string the API expects.
 *
 * A literal comma inside an element would silently split one id into two and
 * corrupt the request — the worst failure mode, since it looks like a valid
 * query. Reject it early with a message naming both the call site (`context`,
 * e.g. `'bibles.list'`) and the offending value.
 */
export function joinIds(ids: string[], context: string): string {
  const bad = ids.find(id => id.includes(','));
  if (bad !== undefined) {
    throw new InvalidInputError(
      `${context}: ids[] element contains a comma which would corrupt CSV serialization: ${JSON.stringify(bad)}`,
    );
  }
  return ids.join(',');
}
