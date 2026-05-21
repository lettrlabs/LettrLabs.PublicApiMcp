import { beforeEach, describe, expect, it } from 'vitest';
import { LettrLabsClient } from '../../src/client.js';
import { dedupeCache } from '../../src/lib/dedupe.js';
import {
  appendOrderRecipients,
  createOrderFromTemplate,
  listOrders,
  previewOrderPricing,
  submitAndChargeOrder,
} from '../../src/tools/curated/orders.js';
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

beforeEach(() => {
  dedupeCache.clear();
});

describe('list_orders', () => {
  it('GETs /v1/order with forwarded query and X-API-KEY', async () => {
    const fetch = fakeFetch({ body: { Orders: [{ Id: 1 }] } });
    const ctx = buildCtx(fetch);

    const result = await listOrders.handler({ status: 'Draft', pageSize: 25 }, ctx);

    expect(result).toEqual({ Orders: [{ Id: 1 }] });
    const [url, init] = firstCall(fetch);
    expect(String(url)).toContain('/v1/order');
    expect(String(url)).toContain('status=Draft');
    expect(String(url)).toContain('pageSize=25');
    expect(init.method).toBe('GET');
    expect(init.headers).toEqual(
      expect.objectContaining({ 'X-API-KEY': TEST_AUTH.apiKey }),
    );
  });
});

describe('preview_order_pricing', () => {
  it('GETs /v1/order/:id/checkout (read-only, no charge)', async () => {
    const fetch = fakeFetch({ body: { TotalCents: 1234 } });
    const ctx = buildCtx(fetch);

    await previewOrderPricing.handler(
      { orderId: 42, postage: 'FirstClass', production: 'Normal' },
      ctx,
    );

    const [url, init] = firstCall(fetch);
    expect(String(url)).toContain('/v1/order/42/checkout');
    expect(String(url)).toContain('postage=FirstClass');
    expect(init.method).toBe('GET');
  });
});

describe('create_order_from_template', () => {
  it('POSTs /v1/order with templateId body', async () => {
    const fetch = fakeFetch({ body: { Payload: { OrderId: 99 } } });
    const ctx = buildCtx(fetch);

    const result = await createOrderFromTemplate.handler({ templateId: 7 }, ctx);

    expect(result).toEqual({ Payload: { OrderId: 99 } });
    const [, init] = firstCall(fetch);
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ templateId: 7 }));
  });

  it('dedupes within the time bucket — second identical call returns cached', async () => {
    const fetch = fakeFetch({ body: { Payload: { OrderId: 99 } } });
    const ctx = buildCtx(fetch);

    await createOrderFromTemplate.handler({ templateId: 7 }, ctx);
    await createOrderFromTemplate.handler({ templateId: 7 }, ctx);

    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('append_order_recipients', () => {
  it('PUTs /v1/order/:id/recipients:append with capitalized Recipients body', async () => {
    const fetch = fakeFetch({ body: { Status: 'success' } });
    const ctx = buildCtx(fetch);

    await appendOrderRecipients.handler(
      {
        orderId: 5,
        recipients: [
          {
            address1: '123 Main St',
            city: 'Boston',
            state: 'MA',
            zipCode: '02101',
          },
        ],
      },
      ctx,
    );

    const [url, init] = firstCall(fetch);
    expect(String(url)).toContain('/v1/order/5/recipients:append');
    expect(init.method).toBe('PUT');
    const body = JSON.parse(init.body as string) as { Recipients: unknown[] };
    expect(body.Recipients).toHaveLength(1);
  });
});

describe('submit_and_charge_order', () => {
  it('refuses without confirm: true', async () => {
    const fetch = fakeFetch({ body: {} });
    const ctx = buildCtx(fetch);

    await expect(
      submitAndChargeOrder.handler(
        {
          orderId: 5,
          postage: 'FirstClass',
          production: 'Normal',
          confirm: false,
        },
        ctx,
      ),
    ).rejects.toThrow(/confirmation/i);

    expect(fetch).not.toHaveBeenCalled();
  });

  it('POSTs /v1/order/:id/checkout when confirm: true', async () => {
    const fetch = fakeFetch({ body: { Payload: { Status: 'Success', OrderId: 5 } } });
    const ctx = buildCtx(fetch);

    await submitAndChargeOrder.handler(
      {
        orderId: 5,
        postage: 'FirstClass',
        production: 'Normal',
        autoBill: true,
        confirm: true,
      },
      ctx,
    );

    const [url, init] = firstCall(fetch);
    expect(String(url)).toContain('/v1/order/5/checkout');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body['PostageType']).toBe('FirstClass');
    expect(body['ProductionSpeed']).toBe('Normal');
    expect(body['AutoBill']).toBe(true);
  });
});
