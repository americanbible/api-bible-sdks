import { describe, it, expect } from 'vitest';
import { stableStringify } from '../src/stable-stringify.js';

describe('stableStringify', () => {
  it('is independent of object key order', () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
    expect(stableStringify({ query: 'gen', limit: 10 })).toBe(
      stableStringify({ limit: 10, query: 'gen' }),
    );
  });

  it('sorts keys at every depth', () => {
    expect(stableStringify({ b: { d: 1, c: 2 }, a: 3 })).toBe('{"a":3,"b":{"c":2,"d":1}}');
  });

  it('preserves array order (position is meaningful) but sorts objects within arrays', () => {
    expect(stableStringify({ ids: [3, 1, 2] })).toBe('{"ids":[3,1,2]}');
    expect(stableStringify([{ b: 1, a: 2 }])).toBe('[{"a":2,"b":1}]');
  });

  it('handles primitives, null, empty objects, and dropped undefined', () => {
    expect(stableStringify({})).toBe('{}');
    expect(stableStringify(null)).toBe('null');
    expect(stableStringify(42)).toBe('42');
    expect(stableStringify('x')).toBe('"x"');
    // Matches JSON.stringify: undefined-valued keys are omitted.
    expect(stableStringify({ a: null, b: undefined })).toBe('{"a":null}');
  });
});
