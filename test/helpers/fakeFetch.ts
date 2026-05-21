import { vi } from 'vitest';

export interface FakeResponse {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

export function fakeFetch(responses: FakeResponse | FakeResponse[]) {
  const queue = Array.isArray(responses) ? [...responses] : [responses];
  return vi.fn((_input: string | URL, _init?: RequestInit): Promise<Response> => {
    const next = queue.shift() ?? queue[queue.length - 1] ?? { status: 200, body: {} };
    const headers = new Headers(next.headers ?? { 'content-type': 'application/json' });
    const text = typeof next.body === 'string' ? next.body : JSON.stringify(next.body ?? {});
    return Promise.resolve(new Response(text, { status: next.status ?? 200, headers }));
  });
}
