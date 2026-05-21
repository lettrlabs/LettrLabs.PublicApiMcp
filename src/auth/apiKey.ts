import type { Request } from 'express';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { AuthContext, AuthProvider } from './index.js';

const HEADER_NAME = 'x-api-key';

/**
 * Extracts the LettrLabs API key from the inbound X-API-KEY header.
 * Matches the auth model of the LettrLabs external API
 * (LettrLabs.App/backend/Controllers/ExternalApi/V1/BaseController.cs).
 */
export class ApiKeyAuthProvider implements AuthProvider {
  extract(req: Request): AuthContext {
    const raw = req.headers[HEADER_NAME];
    const apiKey = Array.isArray(raw) ? raw[0] : raw;

    if (!apiKey || apiKey.trim().length === 0) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'Missing X-API-KEY header. Configure your MCP connector to forward the LettrLabs API key on every request.',
      );
    }

    return { apiKey };
  }
}
