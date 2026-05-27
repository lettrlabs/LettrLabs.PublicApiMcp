import type { Request, Response } from 'express';
import { mintCode } from './codeStore.js';
import { renderConsentPage } from './consentPage.js';

const VALID_PKCE_METHODS = new Set(['S256']);

interface AuthorizeQuery {
  client_id?: string;
  redirect_uri?: string;
  response_type?: string;
  state?: string;
  scope?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  client_name?: string;
}

/** GET /oauth/authorize — render the consent page. */
export function handleAuthorizeGet(req: Request, res: Response): void {
  const q = req.query as AuthorizeQuery;

  const error = validateAuthorizeQuery(q);
  if (error) {
    res.status(400).type('text/plain').send(error);
    return;
  }

  res
    .type('text/html')
    .send(
      renderConsentPage({
        clientName: q.client_name ?? 'MCP client',
        clientId: q.client_id ?? '',
        state: q.state ?? '',
        redirectUri: q.redirect_uri ?? '',
        codeChallenge: q.code_challenge ?? '',
        codeChallengeMethod: q.code_challenge_method ?? 'S256',
      }),
    );
}

/** POST /oauth/authorize — consume the form, mint a code, redirect back. */
export function handleAuthorizePost(req: Request, res: Response): void {
  const body = (req.body ?? {}) as Record<string, string | undefined>;
  const apiKey = body['apiKey']?.trim();
  const clientId = body['client_id'];
  const state = body['state'];
  const redirectUri = body['redirect_uri'];
  const codeChallenge = body['code_challenge'];

  if (!apiKey) {
    res.status(400).type('text/html').send(
      renderConsentPage({
        clientName: 'MCP client',
        clientId: clientId ?? '',
        state: state ?? '',
        redirectUri: redirectUri ?? '',
        codeChallenge: codeChallenge ?? '',
        codeChallengeMethod: 'S256',
        error: 'API key is required.',
      }),
    );
    return;
  }
  if (!clientId || !redirectUri || !codeChallenge) {
    res.status(400).type('text/plain').send('Missing client_id, redirect_uri, or code_challenge.');
    return;
  }

  const code = mintCode({
    apiKey,
    clientId,
    redirectUri,
    codeChallenge,
  });

  const target = new URL(redirectUri);
  target.searchParams.set('code', code);
  if (state) target.searchParams.set('state', state);
  res.redirect(302, target.toString());
}

function validateAuthorizeQuery(q: AuthorizeQuery): string | null {
  if (q.response_type !== 'code') return `unsupported response_type: ${q.response_type ?? '(missing)'}`;
  if (!q.client_id) return 'missing client_id';
  if (!q.redirect_uri) return 'missing redirect_uri';
  if (!q.code_challenge) return 'missing code_challenge';
  if (!q.code_challenge_method || !VALID_PKCE_METHODS.has(q.code_challenge_method)) {
    return `code_challenge_method must be S256`;
  }
  return null;
}
