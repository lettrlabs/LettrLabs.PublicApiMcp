import type { Request, Response } from 'express';

/**
 * RFC 8414 — OAuth 2.0 Authorization Server Metadata.
 * RFC 9728 — OAuth 2.0 Protected Resource Metadata.
 *
 * Claude.ai (and most MCP clients) discover OAuth endpoints by first hitting
 * /mcp without auth, reading the WWW-Authenticate header, then fetching the
 * metadata documents at the URLs below.
 */

function publicBaseUrl(req: Request): string {
  const envBase = process.env.PUBLIC_BASE_URL;
  if (envBase) return envBase.replace(/\/+$/, '');
  // Fallback — derive from the incoming request. Works behind a TLS-terminating
  // ingress that sets X-Forwarded-Proto + X-Forwarded-Host.
  const proto =
    (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim() ?? req.protocol;
  const host = (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers.host;
  return `${proto}://${host}`;
}

export function handleProtectedResourceMetadata(req: Request, res: Response): void {
  const base = publicBaseUrl(req);
  res.json({
    resource: base,
    authorization_servers: [base],
    bearer_methods_supported: ['header'],
  });
}

export function handleAuthorizationServerMetadata(req: Request, res: Response): void {
  const base = publicBaseUrl(req);
  res.json({
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    scopes_supported: ['mcp'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
  });
}
