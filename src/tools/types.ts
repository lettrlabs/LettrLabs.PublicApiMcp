import type { z } from 'zod';
import type { AuthContext } from '../auth/index.js';
import type { LettrLabsClient } from '../client.js';

export interface ToolContext {
  auth: AuthContext;
  client: LettrLabsClient;
}

/**
 * Shape every curated tool conforms to. The registry consumes these and
 * converts them into MCP SDK tool descriptors.
 *
 * `dedupe` and `charge` are advisory flags so the registry can apply
 * cross-cutting behavior; tool handlers also call the helpers directly when
 * the per-tool messaging matters (e.g. `assertConfirmed(..., "Submitting...")`).
 */
export interface CuratedTool<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  handler: (input: TInput, ctx: ToolContext) => Promise<TOutput>;
}
