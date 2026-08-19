import { describe, it, expect } from 'vitest';
import * as sdk from '../src/index.js';
import {
  createBibleClient,
  ApiError,
  AuthError,
  BadRequestError,
  BibleError,
  InvalidInputError,
  MAX_ERROR_BODY_BYTES,
  NetworkError,
  NotFoundError,
  RateLimitError,
  ServerError,
  ValidationError,
} from '../src/index.js';

// Smoke test for the published barrel: every runtime value the package promises
// must be reachable from the package root. Type-only exports are verified by the
// imports above type-checking; this guards the runtime surface against an
// accidental dropped re-export.

describe('public entrypoint (src/index.ts)', () => {
  it('exports the client factory', () => {
    expect(typeof createBibleClient).toBe('function');
  });

  it('exports the full error hierarchy', () => {
    const errorClasses = [
      BibleError,
      ApiError,
      AuthError,
      BadRequestError,
      NotFoundError,
      RateLimitError,
      ServerError,
      NetworkError,
      InvalidInputError,
      ValidationError,
    ];
    for (const cls of errorClasses) {
      expect(typeof cls).toBe('function');
      expect(cls.prototype).toBeInstanceOf(Error);
    }
  });

  it('exports the error-body cap constant', () => {
    expect(typeof MAX_ERROR_BODY_BYTES).toBe('number');
  });

  it('does not export anything unexpected at runtime', () => {
    expect(Object.keys(sdk).sort()).toEqual(
      [
        'ApiError',
        'AuthError',
        'BadRequestError',
        'BibleError',
        'InvalidInputError',
        'MAX_ERROR_BODY_BYTES',
        'NetworkError',
        'NotFoundError',
        'RateLimitError',
        'ServerError',
        'ValidationError',
        'createBibleClient',
      ].sort(),
    );
  });
});
