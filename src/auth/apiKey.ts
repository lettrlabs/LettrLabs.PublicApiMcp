import type { Request } from 'express';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { AuthContext, AuthProvider } from './index.js';

const X_API_KEY = 'x-api-key';

/**
 * Extracts the LettrLabs API key from either of:
 *   - X-API-KEY: <key> header (direct path; matches LettrLabs.App's
 *     ExternalApi BaseController.cs)
 *   - Authorization: Bearer <key> header (OAuth path; the token returned by
 *     /oauth/token IS the API key — see src/oauth/token.ts)
 *
 * Both surfaces produce the same AuthContext. The MCP server doesn't care
 * which transport the credential came in through.
 */
export class ApiKeyAuthProvider implements AuthProvider {
  extract(req: Request): AuthContext {
    const direct = readDirect(req);
    if (direct) return { apiKey: direct };

    const bearer = readBearer(req);
    if (bearer) return { apiKey: bearer };

    throw new McpError(
      ErrorCode.InvalidRequest,
      'Missing credential. Send either X-API-KEY: <key> or Authorization: Bearer <key> on every request.',
    );
  }
}

/** First value of a request header, normalized to a trimmed non-empty string or null. */
function firstHeader(req: Request, name: string): string | null {
  const raw: string | string[] | undefined = req.headers[name];
  const v = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : undefined;
  return v && v.trim().length > 0 ? v.trim() : null;
}

function readDirect(req: Request): string | null {
  return firstHeader(req, X_API_KEY);
}

function readBearer(req: Request): string | null {
  const header = firstHeader(req, 'authorization');
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header);
  const token = m?.[1]?.trim();
  return token && token.length > 0 ? token : null;
}
