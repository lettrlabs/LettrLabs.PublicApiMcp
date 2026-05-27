/**
 * HTML for the OAuth consent page. Hand-written, no template engine — keeps
 * the dependency footprint small and the page predictable.
 *
 * Demo-only UX: the user pastes a LettrLabs API key into a form. The key
 * becomes the bearer token. Production hardening (real LettrLabs SSO, signed
 * short-lived tokens) is on the v1.5 backlog.
 */

export interface ConsentPageInput {
  clientName: string;
  clientId: string;
  state: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  error?: string;
}

export function renderConsentPage(input: ConsentPageInput): string {
  const safeName = escapeHtml(input.clientName || 'an MCP client');
  const errorBlock = input.error
    ? `<div class="error">${escapeHtml(input.error)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Authorize ${safeName} · LettrLabs MCP</title>
  <style>
    :root { color-scheme: light dark; }
    body { font-family: -apple-system, system-ui, "Segoe UI", Roboto, sans-serif;
           background: #0d1117; color: #e6edf3;
           display: flex; min-height: 100vh; margin: 0;
           align-items: center; justify-content: center; padding: 1rem; }
    .card { width: 100%; max-width: 480px; background: #161b22;
            border: 1px solid #30363d; border-radius: 12px;
            padding: 2rem; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
    h1 { margin: 0 0 0.5rem; font-size: 1.4rem; }
    .sub { color: #8b949e; font-size: 0.95rem; margin-bottom: 1.5rem; }
    label { display: block; font-size: 0.9rem; color: #c9d1d9; margin-bottom: 0.4rem; }
    input[type="password"] { width: 100%; box-sizing: border-box;
            background: #0d1117; color: #e6edf3; border: 1px solid #30363d;
            border-radius: 6px; padding: 0.6rem; font-size: 0.95rem;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    button { margin-top: 1rem; width: 100%; background: #238636; color: white;
             border: none; border-radius: 6px; padding: 0.7rem; font-size: 1rem;
             font-weight: 600; cursor: pointer; }
    button:hover { background: #2ea043; }
    .disclaimer { margin-top: 1.5rem; font-size: 0.8rem; color: #8b949e;
                  border-top: 1px solid #30363d; padding-top: 1rem; }
    .error { background: #f8514919; color: #ff7b72; padding: 0.7rem;
             border: 1px solid #f85149; border-radius: 6px; margin-bottom: 1rem;
             font-size: 0.9rem; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
           background: #1f2937; padding: 0.1rem 0.3rem; border-radius: 3px; }
  </style>
</head>
<body>
  <form class="card" method="POST" action="/oauth/authorize">
    <h1>Authorize ${safeName}</h1>
    <p class="sub">${safeName} is requesting permission to access your LettrLabs account through the MCP server.</p>
    ${errorBlock}
    <label for="apiKey">LettrLabs API key</label>
    <input type="password" name="apiKey" id="apiKey" placeholder="LL-API-…" autocomplete="off" required autofocus>
    <input type="hidden" name="client_id" value="${escapeHtml(input.clientId)}">
    <input type="hidden" name="state" value="${escapeHtml(input.state)}">
    <input type="hidden" name="redirect_uri" value="${escapeHtml(input.redirectUri)}">
    <input type="hidden" name="code_challenge" value="${escapeHtml(input.codeChallenge)}">
    <input type="hidden" name="code_challenge_method" value="${escapeHtml(input.codeChallengeMethod)}">
    <button type="submit">Authorize</button>
    <p class="disclaimer">
      The pasted key is held only long enough to complete this authorization.
      It becomes the bearer token ${safeName} uses on subsequent MCP calls — store and rotate accordingly.
      Get a key from <code>app.lettrlabs.com</code> → Settings → API.
    </p>
  </form>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
