import { describe, expect, it } from 'vitest';
import type { Request } from 'express';
import { ApiKeyAuthProvider } from '../../src/auth/apiKey.js';

function reqWith(headers: Record<string, string | string[]>): Request {
  return { headers } as unknown as Request;
}

describe('ApiKeyAuthProvider', () => {
  const provider = new ApiKeyAuthProvider();

  it('extracts key from X-API-KEY header', () => {
    const ctx = provider.extract(reqWith({ 'x-api-key': 'LL-API-direct' }));
    expect(ctx.apiKey).toBe('LL-API-direct');
  });

  it('extracts key from Authorization: Bearer header', () => {
    const ctx = provider.extract(reqWith({ authorization: 'Bearer LL-API-bearer' }));
    expect(ctx.apiKey).toBe('LL-API-bearer');
  });

  it('accepts lowercase "bearer" prefix', () => {
    const ctx = provider.extract(reqWith({ authorization: 'bearer LL-API-lowercase' }));
    expect(ctx.apiKey).toBe('LL-API-lowercase');
  });

  it('X-API-KEY wins over Authorization when both present', () => {
    const ctx = provider.extract(
      reqWith({ 'x-api-key': 'from-x-header', authorization: 'Bearer from-bearer' }),
    );
    expect(ctx.apiKey).toBe('from-x-header');
  });

  it('throws when neither header present', () => {
    expect(() => provider.extract(reqWith({}))).toThrow(/Missing credential/);
  });

  it('throws when X-API-KEY is blank and no Authorization', () => {
    expect(() => provider.extract(reqWith({ 'x-api-key': '   ' }))).toThrow(/Missing credential/);
  });

  it('ignores non-Bearer Authorization schemes', () => {
    expect(() =>
      provider.extract(reqWith({ authorization: 'Basic dXNlcjpwYXNz' })),
    ).toThrow(/Missing credential/);
  });
});
