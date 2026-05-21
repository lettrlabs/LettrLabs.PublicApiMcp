import { describe, expect, it } from 'vitest';
import { LettrLabsClient } from '../../src/client.js';
import { callLettrLabsApi } from '../../src/tools/raw-api.js';
import { fakeFetch } from '../helpers/fakeFetch.js';

const TEST_AUTH = { apiKey: 'test-key' };

function buildCtx(fetchImpl: ReturnType<typeof fakeFetch>) {
  const client = new LettrLabsClient({
    baseUrl: 'https://app-dev.lettrlabs.com',
    apiKey: TEST_AUTH.apiKey,
    fetchImpl,
  });
  return { auth: TEST_AUTH, client };
}

function firstCall(fetch: ReturnType<typeof fakeFetch>): [string | URL, RequestInit] {
  return fetch.mock.calls[0] as [string | URL, RequestInit];
}

describe('call_lettrlabs_api', () => {
  it('forwards a known external path', async () => {
    const fetch = fakeFetch({ body: { ok: true } });
    const ctx = buildCtx(fetch);

    const result = await callLettrLabsApi.handler(
      { method: 'GET', path: '/v1/me' },
      ctx,
    );

    expect(result).toEqual({ ok: true });
    const [url] = firstCall(fetch);
    expect(String(url)).toContain('/v1/me');
  });

  it('forwards a parameterized path against the known template', async () => {
    const fetch = fakeFetch({ body: { Recipients: [] } });
    const ctx = buildCtx(fetch);

    const result = await callLettrLabsApi.handler(
      { method: 'GET', path: '/v1/order/42/recipients' },
      ctx,
    );

    expect(result).toEqual({ Recipients: [] });
  });

  it('rejects unknown paths with a list of valid endpoints', async () => {
    const fetch = fakeFetch({ body: {} });
    const ctx = buildCtx(fetch);

    await expect(
      callLettrLabsApi.handler({ method: 'GET', path: '/v1/totally-made-up' }, ctx),
    ).rejects.toThrow(/no external lettrlabs endpoint matches/i);

    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects unknown methods on a known path', async () => {
    const fetch = fakeFetch({ body: {} });
    const ctx = buildCtx(fetch);

    await expect(
      callLettrLabsApi.handler({ method: 'PATCH', path: '/v1/order' }, ctx),
    ).rejects.toThrow();

    expect(fetch).not.toHaveBeenCalled();
  });
});
