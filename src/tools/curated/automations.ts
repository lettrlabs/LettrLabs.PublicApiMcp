import { z } from 'zod';
import type { CuratedTool } from '../types.js';

const ListAutomationsInput = z.object({
  pageNumber: z.number().int().nonnegative().optional().describe('Pagination: 0-indexed page number.'),
  pageSize: z.number().int().positive().max(500).optional().describe('Pagination: results per page.'),
});

export const listAutomations: CuratedTool<z.infer<typeof ListAutomationsInput>> = {
  name: 'list_automations',
  description:
    'List LettrLabs automations (also known internally as integration orders, smart automations, or trickle orders — all the same thing). These are recurring mailings triggered by integrations (Shopify, Klaviyo, ServiceTitan, etc.) or scheduled cadences. Use this to answer "what automations do I have running" or "show me my trigger campaigns".',
  inputSchema: ListAutomationsInput,
  handler: async (input, { client }) => client.get('/v1/integration-orders', input),
};

export const automationTools: CuratedTool[] = [listAutomations as CuratedTool];
