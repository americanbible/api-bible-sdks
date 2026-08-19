import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
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
} from '../src/http/errors.js';

describe('error hierarchy', () => {
  it.each([
    ['ApiError', new ApiError('msg', 500, '')],
    ['AuthError', new AuthError('msg', 401, '')],
    ['NotFoundError', new NotFoundError('msg', 404, '')],
    ['BadRequestError', new BadRequestError('msg', 400, '')],
    ['RateLimitError', new RateLimitError('msg', 429, '')],
    ['ServerError', new ServerError('msg', 500, '')],
    ['NetworkError', new NetworkError('socket hang up')],
    ['InvalidInputError', new InvalidInputError('bad input')],
    ['ValidationError', new ValidationError('schema mismatch', [])],
  ] as const)('%s is a BibleError and a real Error', (_name, err) => {
    expect(err).toBeInstanceOf(BibleError);
    expect(err).toBeInstanceOf(Error);
  });

  it('NetworkError is an ApiError (a request was attempted)', () => {
    expect(new NetworkError('socket hang up')).toBeInstanceOf(ApiError);
  });

  it.each([
    ['InvalidInputError', new InvalidInputError('bad input')],
    ['ValidationError', new ValidationError('schema mismatch', [])],
  ] as const)('%s is NOT an ApiError (no request was made / API not at fault)', (_name, err) => {
    expect(err).not.toBeInstanceOf(ApiError);
  });
});

describe('Error.cause forwarding', () => {
  it('ApiError forwards cause when provided', () => {
    const root = new Error('socket hang up');
    const err = new ApiError('upstream failed', 502, '', root);
    expect(err.cause).toBe(root);
  });

  it('ApiError omits the cause property entirely when not provided', () => {
    const err = new ApiError('boom', 500, '');
    expect('cause' in err).toBe(false);
  });

  it.each([
    ['AuthError', AuthError],
    ['NotFoundError', NotFoundError],
    ['BadRequestError', BadRequestError],
    ['RateLimitError', RateLimitError],
    ['ServerError', ServerError],
  ] as const)('%s forwards cause through the ApiError super chain', (_name, ErrorClass) => {
    const root = new TypeError('fetch failed');
    const err = new ErrorClass('msg', 500, 'body', root);
    expect(err.cause).toBe(root);
  });

  it('ValidationError forwards cause when provided', () => {
    const root = new SyntaxError('Unexpected token');
    const err = new ValidationError('Response is not valid JSON', [], root);
    expect(err.cause).toBe(root);
  });

  it('ValidationError omits the cause property entirely when not provided', () => {
    const err = new ValidationError('Response validation failed', []);
    expect('cause' in err).toBe(false);
  });
});

describe('ApiError body truncation', () => {
  it('leaves bodies at or below the cap untouched', () => {
    const body = 'x'.repeat(MAX_ERROR_BODY_BYTES);
    const err = new ApiError('boom', 500, body);
    expect(err.body).toBe(body);
    expect(err.bodyTruncated).toBe(false);
  });

  it('slices oversize bodies to exactly MAX_ERROR_BODY_BYTES', () => {
    const body = 'x'.repeat(MAX_ERROR_BODY_BYTES + 5_000);
    const err = new ApiError('boom', 500, body);
    expect(err.body.length).toBe(MAX_ERROR_BODY_BYTES);
    expect(err.bodyTruncated).toBe(true);
  });

  it('leaves an empty body alone and reports bodyTruncated=false', () => {
    const err = new ApiError('boom', 500, '');
    expect(err.body).toBe('');
    expect(err.bodyTruncated).toBe(false);
  });

  it.each([
    ['AuthError', AuthError],
    ['NotFoundError', NotFoundError],
    ['BadRequestError', BadRequestError],
    ['RateLimitError', RateLimitError],
    ['ServerError', ServerError],
  ] as const)('%s inherits the truncation', (_name, ErrorClass) => {
    const body = 'y'.repeat(MAX_ERROR_BODY_BYTES + 10);
    const err = new ErrorClass('msg', 500, body);
    expect(err.body.length).toBe(MAX_ERROR_BODY_BYTES);
    expect(err.bodyTruncated).toBe(true);
  });

  it('NetworkError always reports an empty, untruncated body', () => {
    const err = new NetworkError('socket hang up');
    expect(err.body).toBe('');
    expect(err.bodyTruncated).toBe(false);
  });
});

describe('ValidationError.format', () => {
  // Builds a realistic ZodIssue[] by intentionally failing a small schema.
  function issuesFor(schema: z.ZodTypeAny, value: unknown) {
    const result = schema.safeParse(value);
    if (result.success) throw new Error('test setup: schema should have failed');
    return result.error.issues;
  }

  it('returns the message alone when there are no issues', () => {
    const err = new ValidationError('Response is not valid JSON', []);
    expect(err.format()).toBe('Response is not valid JSON');
  });

  it('includes the field path and message for each issue', () => {
    const schema = z.object({ data: z.object({ id: z.string() }) });
    const issues = issuesFor(schema, { data: { id: 42 } });
    const err = new ValidationError('Response validation failed', issues);

    const formatted = err.format();
    expect(formatted).toContain('Response validation failed:');
    expect(formatted).toContain('data.id:');
  });

  it('renders <root> when the issue has no path', () => {
    const schema = z.string();
    const issues = issuesFor(schema, 42);
    const err = new ValidationError('Response validation failed', issues);

    expect(err.format()).toContain('<root>:');
  });

  it('joins array indices into the path', () => {
    const schema = z.object({ items: z.array(z.object({ name: z.string() })) });
    const issues = issuesFor(schema, { items: [{ name: 'ok' }, { name: 99 }] });
    const err = new ValidationError('Response validation failed', issues);

    expect(err.format()).toContain('items.1.name:');
  });
});
