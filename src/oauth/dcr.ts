import type { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';

/**
 * RFC 7591 — OAuth 2.0 Dynamic Client Registration.
 *
 * Claude.ai and ChatGPT both register themselves as a client on first
 * connection. We accept any registration and return a stub client_id;
 * we don't store anything because the bearer token alone authenticates
 * subsequent requests (no per-client policies in this demo shim).
 */
export function handleDynamicClientRegistration(req: Request, res: Response): void {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const clientId = `mcp-client-${randomBytes(8).toString('hex')}`;
  res.status(201).json({
    client_id: clientId,
    // Token endpoint requires no auth (we treat tokens as bearer-only)
    token_endpoint_auth_method: 'none',
    // Echo what the client said it would do
    redirect_uris: Array.isArray(body['redirect_uris']) ? body['redirect_uris'] : [],
    client_name: typeof body['client_name'] === 'string' ? body['client_name'] : undefined,
    grant_types: ['authorization_code'],
    response_types: ['code'],
  });
}
