/**
 * How a Neon Auth failure is described to the person deleting their account.
 *
 * The provider's client is inconsistent - it sometimes resolves with an
 * `error` object and sometimes throws an `AuthApiError`, and the HTTP status
 * turns up under three different keys. Whatever shape arrives, the rule is
 * the same: never imply the sign-in identity is gone when it is not.
 */
import { describe, expect, it } from 'vitest';
import { classifyIdentityFailure } from '@/lib/authClient';

describe('classifyIdentityFailure', () => {
  it('treats a thrown AuthApiError with status 404 as "not available here"', () => {
    // Exactly what @neondatabase/neon-js throws when the endpoint is off.
    const thrown = Object.assign(new Error('Not found'), {
      __isAuthError: true, name: 'AuthApiError', status: 404, code: 'user_not_found',
    });
    const out = classifyIdentityFailure(thrown);
    expect(out.status).toBe('unsupported');
    expect(out.status === 'unsupported' && out.message).toMatch(/not available/i);
  });

  it('accepts the string form of the status', () => {
    expect(classifyIdentityFailure({ status: 'NOT_FOUND', message: 'Not found' }).status)
      .toBe('unsupported');
  });

  it('accepts statusCode as well as status', () => {
    expect(classifyIdentityFailure({ statusCode: 501, status: 'NOT_IMPLEMENTED' }).status)
      .toBe('unsupported');
  });

  it('keeps a real refusal a failure, with the provider\u2019s own words', () => {
    const out = classifyIdentityFailure({ status: 500, message: 'Session too old' });
    expect(out.status).toBe('failed');
    expect(out.status === 'failed' && out.message).toBe('Session too old');
  });

  it('never reports a deletion it did not observe', () => {
    for (const raw of [null, undefined, {}, new Error(''), 'nonsense']) {
      const out = classifyIdentityFailure(raw);
      expect(out.status === 'unsupported' || out.status === 'failed').toBe(true);
      expect(out.status).not.toBe('deleted');
    }
  });
});
