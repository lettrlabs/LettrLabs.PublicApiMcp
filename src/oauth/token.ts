import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { consumeCode } from './codeStore.js';

/**
 * POST /oauth/token — exchange authorization code for bearer token.
 *
 * Verifies PKCE (S256) per OAuth 2.1. The returned access token IS the
 * LettrLabs API key the user pasted on the consent page — this is a demo
 * shim, not real token wrapping. Production hardening on the v1.5 backlog.
 */
export function handleTokenExchange(req: Request, res: Response): void {
  const body = (req.body ?? {}) as Record<string, string | undefined>;

  const grantType = body['grant_type'];
  if (grantType !== 'authorization_code') {
    sendOAuthError(res, 400, 'unsupported_grant_type', `unsupported grant_type: ${grantType ?? '(missing)'}`);
    return;
  }

  const code = body['code'];
  const codeVerifier = body['code_verifier'];
  const redirectUri = body['redirect_uri'];
  const clientId = body['client_id'];

  if (!code || !codeVerifier || !redirectUri || !clientId) {
    sendOAuthError(res, 400, 'invalid_request', 'missing code, code_verifier, redirect_uri, or client_id');
    return;
  }

  const entry = consumeCode(code);
  if (!entry) {
    sendOAuthError(res, 400, 'invalid_grant', 'unknown or expired authorization code');
    return;
  }
  if (entry.clientId !== clientId) {
    sendOAuthError(res, 400, 'invalid_grant', 'client_id mismatch');
    return;
  }
  if (entry.redirectUri !== redirectUri) {
    sendOAuthError(res, 400, 'invalid_grant', 'redirect_uri mismatch');
    return;
  }

  // PKCE: SHA-256 of the verifier (base64url) must equal the stored challenge.
  const computedChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  if (computedChallenge !== entry.codeChallenge) {
    sendOAuthError(res, 400, 'invalid_grant', 'PKCE verification failed');
    return;
  }

  // The bearer token IS the LettrLabs API key. Stateless — no token DB needed.
  res.json({
    access_token: entry.apiKey,
    token_type: 'Bearer',
    // No refresh token — clients re-do the authorization flow when the key
    // is rotated.
    scope: 'mcp',
  });
}

function sendOAuthError(res: Response, status: number, error: string, description: string): void {
  res.status(status).json({ error, error_description: description });
}
