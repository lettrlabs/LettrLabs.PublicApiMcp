import { beforeEach, describe, expect, it } from 'vitest';
import { clearCodes, consumeCode, mintCode } from '../../src/oauth/codeStore.js';

beforeEach(() => {
  clearCodes();
});

describe('OAuth code store', () => {
  it('mint + consume returns the original entry', () => {
    const code = mintCode({
      apiKey: 'LL-API-test',
      codeChallenge: 'challenge-123',
      redirectUri: 'https://claude.ai/callback',
      clientId: 'mcp-client-abc',
    });
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);

    const entry = consumeCode(code);
    expect(entry).toMatchObject({
      apiKey: 'LL-API-test',
      codeChallenge: 'challenge-123',
      redirectUri: 'https://claude.ai/callback',
      clientId: 'mcp-client-abc',
    });
  });

  it('consume returns null on second use (one-time)', () => {
    const code = mintCode({
      apiKey: 'k',
      codeChallenge: 'c',
      redirectUri: 'r',
      clientId: 'ci',
    });
    expect(consumeCode(code)).not.toBeNull();
    expect(consumeCode(code)).toBeNull();
  });

  it('consume returns null for unknown code', () => {
    expect(consumeCode('this-code-was-never-minted')).toBeNull();
  });

  it('two mints produce two different codes', () => {
    const a = mintCode({ apiKey: 'k', codeChallenge: 'c', redirectUri: 'r', clientId: 'ci' });
    const b = mintCode({ apiKey: 'k', codeChallenge: 'c', redirectUri: 'r', clientId: 'ci' });
    expect(a).not.toBe(b);
  });
});
