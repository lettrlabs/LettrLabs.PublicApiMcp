import { z } from 'zod';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { dedupedCall } from '../lib/dedupe.js';
import { listExternalEndpoints, matchExternalEndpoint } from '../openapi/spec.js';
import type { HttpMethod } from '../client.js';
import type { CuratedTool } from './types.js';

const MethodSchema = z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']);

const CallLettrLabsApiInput = z.object({
  method: MethodSchema.describe('HTTP method.'),
  path: z
    .string()
    .min(1)
    .describe(
      'Path on the LettrLabs API, starting with "/v1/" (e.g. "/v1/order/123/recipients"). Use a curated tool when one exists for the action you want.',
    ),
  query: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional()
    .describe('Optional query string parameters as key/value pairs.'),
  body: z
    .unknown()
    .optional()
    .describe('Optional JSON request body for POST/PUT/PATCH/DELETE.'),
});

const WRITE_METHODS = new Set<HttpMethod>(['POST', 'PUT', 'PATCH', 'DELETE']);

function buildAllowList(): string {
  return listExternalEndpoints()
    .map((ep) => `  ${ep.method.padEnd(6)} ${ep.path}`)
    .join('\n');
}

export const callLettrLabsApi: CuratedTool<z.infer<typeof CallLettrLabsApiInput>> = {
  name: 'call_lettrlabs_api',
  description:
    'Escape hatch: call ANY endpoint on the LettrLabs external API. Prefer a curated tool (list_orders, create_order_from_template, etc.) when one exists — curated tools have better typing and clearer behavior. Use this for endpoints not yet curated (deletes, address book, mail-by-proximity, conversion CRUD, QR scan). Only paths on the known external surface are allowed; unknown paths return an error.',
  inputSchema: CallLettrLabsApiInput,
  handler: async (input, { client, auth }) => {
    const match = matchExternalEndpoint(input.method, input.path);
    if (!match.matched) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `${match.reason ?? 'Path is not on the LettrLabs external API surface.'}\n\nKnown external endpoints:\n${buildAllowList()}`,
      );
    }

    const isWrite = WRITE_METHODS.has(input.method);
    const call = (): Promise<unknown> =>
      client.request(input.method, input.path, {
        query: input.query,
        body: input.body,
      });

    if (isWrite) {
      return dedupedCall('call_lettrlabs_api', auth.apiKey, input, call);
    }
    return call();
  },
};
