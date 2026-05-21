import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

/**
 * Mix in to any charge tool's Zod input schema to enforce confirmation.
 *
 * v1 uses the explicit-parameter path because Copilot Studio and Gemini
 * Enterprise / Agent Builder support arbitrary tool parameters today, but
 * MCP elicitation support across hosts is uneven. A future enhancement can
 * swap this for `server.elicitInput(...)` when host support is consistent.
 */
export const confirmSchema = z.object({
  confirm: z
    .boolean()
    .describe(
      'Must be set to true to actually execute this charge. Confirms the user has reviewed pricing and authorized the spend.',
    ),
});

export function assertConfirmed(input: { confirm?: unknown }, action: string): void {
  if (input.confirm !== true) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `${action} requires explicit confirmation. Re-call this tool with confirm: true to proceed. ` +
        `This action triggers a charge that cannot be rolled back from the MCP layer.`,
    );
  }
}
