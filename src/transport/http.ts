import express, { type Express, type Request, type Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { AuthProvider } from '../auth/index.js';
import { toMcpError } from '../lib/errors.js';
import { logger } from '../lib/logging.js';
import { handleAuthorizeGet, handleAuthorizePost } from '../oauth/authorize.js';
import { handleDynamicClientRegistration } from '../oauth/dcr.js';
import {
  handleAuthorizationServerMetadata,
  handleProtectedResourceMetadata,
} from '../oauth/metadata.js';
import { handleTokenExchange } from '../oauth/token.js';
import { buildServer, type ServerEnv } from '../tools/index.js';

export interface HttpServerOptions {
  authProvider: AuthProvider;
  env: ServerEnv;
}

/**
 * Build the Express app that hosts the MCP server over Streamable HTTP.
 *
 * Endpoints:
 *   - GET  /health                                  liveness/readiness probe
 *   - POST /mcp                                     MCP protocol (Streamable HTTP)
 *   - GET  /.well-known/oauth-protected-resource    RFC 9728 metadata
 *   - GET  /.well-known/oauth-authorization-server  RFC 8414 metadata
 *   - POST /oauth/register                          RFC 7591 dynamic client registration
 *   - GET  /oauth/authorize                         consent page (HTML)
 *   - POST /oauth/authorize                         form submit -> redirect with code
 *   - POST /oauth/token                             code -> bearer (= LettrLabs API key)
 */
export function createHttpApp(opts: HttpServerOptions): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true); // honor X-Forwarded-* from the ingress
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: false }));

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: opts.env.serverName, version: opts.env.serverVersion });
  });

  // OAuth metadata (unauthenticated; required for client discovery)
  app.get('/.well-known/oauth-protected-resource', handleProtectedResourceMetadata);
  app.get('/.well-known/oauth-authorization-server', handleAuthorizationServerMetadata);

  // OAuth endpoints
  app.post('/oauth/register', handleDynamicClientRegistration);
  app.get('/oauth/authorize', handleAuthorizeGet);
  app.post('/oauth/authorize', handleAuthorizePost);
  app.post('/oauth/token', handleTokenExchange);

  // MCP protocol endpoint
  app.post('/mcp', (req: Request, res: Response) => {
    void handleMcpRequest(req, res, opts);
  });

  app.get('/mcp', (_req: Request, res: Response) => {
    res.status(405).json({ error: 'Method Not Allowed. Use POST for MCP requests.' });
  });

  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: `Unknown path ${req.method} ${req.path}` });
  });

  return app;
}

async function handleMcpRequest(
  req: Request,
  res: Response,
  opts: HttpServerOptions,
): Promise<void> {
  try {
    const auth = await opts.authProvider.extract(req);
    const server = buildServer(auth, opts.env);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on('close', () => {
      void transport.close();
      void server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    const mcpErr = toMcpError(err);
    logger.warn({ err: mcpErr.message, code: mcpErr.code }, 'MCP request failed');
    if (res.headersSent) return;

    const isAuthError = mcpErr.code !== -32600 && mcpErr.code !== -32602;
    if (isAuthError) {
      // Point clients (Claude.ai, ChatGPT, etc.) at the OAuth metadata
      // endpoint so they can discover how to authenticate.
      const proto =
        (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim() ??
        req.protocol;
      const host = (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers.host;
      const base = process.env.PUBLIC_BASE_URL ?? `${proto}://${host}`;
      res.setHeader(
        'WWW-Authenticate',
        `Bearer realm="LettrLabs MCP", resource_metadata="${base.replace(/\/+$/, '')}/.well-known/oauth-protected-resource"`,
      );
      res.status(401).json({ error: mcpErr.message, code: mcpErr.code });
    } else {
      res.status(400).json({ error: mcpErr.message, code: mcpErr.code });
    }
  }
}
