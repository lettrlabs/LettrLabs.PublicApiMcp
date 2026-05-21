import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { AuthContext } from '../auth/index.js';
import { LettrLabsClient } from '../client.js';
import { toMcpError } from '../lib/errors.js';
import { logger } from '../lib/logging.js';
import { automationTools } from './curated/automations.js';
import { conversionTools } from './curated/conversions.js';
import { orderTools } from './curated/orders.js';
import { profileTools } from './curated/profile.js';
import { callLettrLabsApi } from './raw-api.js';
import type { CuratedTool, ToolContext } from './types.js';

export function allTools(): CuratedTool[] {
  return [
    ...orderTools,
    ...automationTools,
    ...conversionTools,
    ...profileTools,
    callLettrLabsApi as CuratedTool,
  ];
}

export interface ServerEnv {
  serverName: string;
  serverVersion: string;
  lettrlabsApiBaseUrl: string;
}

/**
 * Build a fresh MCP server instance bound to a single inbound request's auth
 * context. We instantiate per request so each call carries its own API key
 * without leaking across requests.
 */
export function buildServer(auth: AuthContext, env: ServerEnv): McpServer {
  const server = new McpServer(
    { name: env.serverName, version: env.serverVersion },
    { capabilities: { tools: {} } },
  );

  const client = new LettrLabsClient({
    baseUrl: env.lettrlabsApiBaseUrl,
    apiKey: auth.apiKey,
  });
  const ctx: ToolContext = { auth, client };

  for (const tool of allTools()) {
    const shape = extractShape(tool.inputSchema);
    server.tool(
      tool.name,
      tool.description,
      shape,
      async (args: unknown): Promise<CallToolResult> => {
        try {
          const parsed = tool.inputSchema.parse(args);
          const result = await tool.handler(parsed, ctx);
          return {
            content: [
              {
                type: 'text',
                text: stringifyResult(result),
              },
            ],
          };
        } catch (err) {
          const mcpErr = toMcpError(err);
          logger.warn(
            { tool: tool.name, error: mcpErr.message, code: mcpErr.code },
            'tool error',
          );
          return {
            content: [{ type: 'text', text: mcpErr.message }],
            isError: true,
          };
        }
      },
    );
  }

  return server;
}

function extractShape(schema: z.ZodType<unknown>): z.ZodRawShape {
  // All curated tools wrap their inputs in z.object({...}); pull the raw
  // shape so the MCP SDK can derive a JSON Schema for it.
  if (schema instanceof z.ZodObject) {
    return (schema as z.ZodObject<z.ZodRawShape>).shape;
  }
  return {};
}

function stringifyResult(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
