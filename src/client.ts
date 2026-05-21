import { LettrLabsApiError } from './lib/errors.js';
import { logger } from './lib/logging.js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export type QueryValue = string | number | boolean | undefined | null;
// Permissive on the input side — tool handlers receive wider types from Zod
// (Record<string, unknown>). buildUrl stringifies anything non-null/undefined.
export type Query = Record<string, unknown>;

export interface RequestOptions {
  query?: Query;
  body?: unknown;
}

export interface ClientOptions {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

/**
 * Thin wrapper around fetch that targets the LettrLabs external API.
 * Forwards X-API-KEY on every request. One instance per inbound MCP request
 * (the apiKey is encapsulated in the instance so tool handlers don't have
 * to thread it through every call).
 */
export class LettrLabsClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: ClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  get<T = unknown>(path: string, query?: Query): Promise<T> {
    return this.request<T>('GET', path, { query });
  }

  post<T = unknown>(path: string, body?: unknown, query?: Query): Promise<T> {
    return this.request<T>('POST', path, { body, query });
  }

  put<T = unknown>(path: string, body?: unknown, query?: Query): Promise<T> {
    return this.request<T>('PUT', path, { body, query });
  }

  delete<T = unknown>(path: string, query?: Query): Promise<T> {
    return this.request<T>('DELETE', path, { query });
  }

  async request<T = unknown>(
    method: HttpMethod,
    path: string,
    opts: RequestOptions = {},
  ): Promise<T> {
    const url = this.buildUrl(path, opts.query);
    const headers: Record<string, string> = {
      'X-API-KEY': this.options.apiKey,
      Accept: 'application/json',
    };
    if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ method, path, err: message }, 'LettrLabs API fetch failed');
      throw new LettrLabsApiError(0, null, undefined, `Network error calling LettrLabs API: ${message}`);
    }

    const requestId = response.headers.get('x-request-id') ?? undefined;
    const contentType = response.headers.get('content-type') ?? '';
    const isJson = contentType.includes('application/json');
    const text = await response.text();
    const parsed = text.length > 0 && isJson ? safeJsonParse(text) : text;

    if (!response.ok) {
      const message =
        typeof parsed === 'string' && parsed.length > 0
          ? parsed
          : `LettrLabs API returned ${response.status} ${response.statusText}`;
      logger.warn(
        { method, path, status: response.status, requestId },
        'LettrLabs API error response',
      );
      throw new LettrLabsApiError(response.status, parsed, requestId, message);
    }

    return parsed as T;
  }

  private buildUrl(path: string, query?: Query): string {
    const base = this.options.baseUrl.replace(/\/+$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${base}${cleanPath}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) continue;
        if (Array.isArray(value)) {
          for (const item of value) {
            const s = stringifyQueryValue(item);
            if (s !== undefined) url.searchParams.append(key, s);
          }
        } else {
          const s = stringifyQueryValue(value);
          if (s !== undefined) url.searchParams.set(key, s);
        }
      }
    }
    return url.toString();
  }
}

function stringifyQueryValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return value.toString();
  }
  // Anything else (objects/arrays) — JSON-encode to avoid '[object Object]'.
  return JSON.stringify(value);
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
