import express, { type Express, type Request, type Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { AuthProvider } from '../auth/index.js';
import { toMcpError } from '../lib/errors.js';
import { logger } from '../lib/logging.js';
import { buildServer, type ServerEnv } from '../tools/index.js';

export interface HttpServerOptions {
  authProvider: AuthProvider;
  env: ServerEnv;
}

/**
 * Build the Express app that hosts the MCP server over Streamable HTTP.
 *
 * - GET /health — liveness/readiness for k8s probes.
 * - POST /mcp — MCP protocol endpoint. Stateless: each request extracts
 *   credentials, builds a fresh MCP server bound to that auth, and tears
 *   it down when the response closes.
 */
export function createHttpApp(opts: HttpServerOptions): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '5mb' }));

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: opts.env.serverName, version: opts.env.serverVersion });
  });

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
    if (!res.headersSent) {
      const status = mcpErr.code === -32600 || mcpErr.code === -32602 ? 400 : 401;
      res.status(status).json({ error: mcpErr.message, code: mcpErr.code });
    }
  }
}
