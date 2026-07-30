import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

export class LettrLabsApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    public readonly requestId: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = 'LettrLabsApiError';
  }
}

/**
 * Compose an agent-facing message from a LettrLabs API error body.
 *
 * The API's error contract carries machine-readable detail the caller needs to
 * self-diagnose — a top-level `reasonCode` (e.g. the DELETE /v1/order/{id}
 * refusal contract's `OrderDeleteRefusalReasons`), per-recipient `reasonCode`s
 * inside a results array (the integration recipients 422
 * `RecipientRejectionReasons`), and the legacy free-text `errors[]` / `message`.
 * The client stores the parsed body on `LettrLabsApiError.body` but sets the
 * message to a generic status line whenever the body is JSON, so without this
 * the reasonCode never reaches the agent. Bare-string / unrecognized bodies fall
 * back to the generic message unchanged.
 */
export function formatApiErrorMessage(body: unknown, fallback: string): string {
  if (body === null || typeof body !== 'object') return fallback;
  const b = body as Record<string, unknown>;
  const parts: string[] = [];

  const reasonCode = typeof b['reasonCode'] === 'string' ? b['reasonCode'] : undefined;
  if (reasonCode) parts.push(`reasonCode: ${reasonCode}`);

  const itemCodes = collectItemReasonCodes(b);
  if (itemCodes.length > 0) parts.push(`recipient reasonCodes: ${itemCodes.join(', ')}`);

  const message = typeof b['message'] === 'string' ? b['message'] : undefined;
  const errs = Array.isArray(b['errors'])
    ? (b['errors'] as unknown[]).filter((e): e is string => typeof e === 'string')
    : [];
  const detail = [message, ...errs].filter((s): s is string => Boolean(s)).join('; ');
  if (detail) parts.push(detail);

  if (parts.length === 0) return fallback;
  return `${fallback} — ${parts.join(' — ')}`;
}

// Scan any array-valued property of the body for items carrying a string
// `reasonCode` (the integration recipients 422 returns per-recipient codes; the
// exact wrapper key is not depended on).
function collectItemReasonCodes(body: Record<string, unknown>): string[] {
  const codes = new Set<string>();
  for (const value of Object.values(body)) {
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (item && typeof item === 'object') {
        const code = (item as Record<string, unknown>)['reasonCode'];
        if (typeof code === 'string') codes.add(code);
      }
    }
  }
  return [...codes];
}

function describeApiError(err: LettrLabsApiError): string {
  const base = formatApiErrorMessage(err.body, err.message);
  const prefix =
    err.status === 401
      ? 'Authentication failed (missing or invalid API key)'
      : err.status === 403
        ? 'Entitlement/permission denied (your plan may not include this feature)'
        : err.status >= 500
          ? 'LettrLabs API server error'
          : undefined;
  return prefix ? `${prefix}: ${base}` : base;
}

/**
 * Map an arbitrary error from the LettrLabs API client into a structured MCP
 * tool error. Avoids leaking stack traces or internal hostnames to the caller,
 * while surfacing the API's machine-readable error detail (reasonCode, error
 * body) so the agent can self-diagnose. The structured body is also carried in
 * the McpError `data` for clients that read it.
 */
export function toMcpError(err: unknown): McpError {
  if (err instanceof McpError) {
    return err;
  }
  if (err instanceof LettrLabsApiError) {
    // A by-design refusal (4xx, e.g. 400 + reasonCode) maps to InvalidParams; an
    // unexpected fault (the declared 500) maps to InternalError — so the agent
    // can tell a refusal from a server error. 401/403 stay InvalidRequest.
    const code =
      err.status === 401 || err.status === 403
        ? ErrorCode.InvalidRequest
        : err.status >= 500
          ? ErrorCode.InternalError
          : ErrorCode.InvalidParams;
    return new McpError(code, describeApiError(err), {
      status: err.status,
      requestId: err.requestId,
      body: err.body,
    });
  }
  if (err instanceof Error) {
    return new McpError(ErrorCode.InternalError, err.message);
  }
  return new McpError(ErrorCode.InternalError, 'Unknown error from LettrLabs API');
}
