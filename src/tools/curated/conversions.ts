import { z } from 'zod';
import type { CuratedTool } from '../types.js';

const ListConversionsInput = z.object({
  pageNumber: z.number().int().nonnegative().optional().describe('Pagination: 0-indexed page number.'),
  pageSize: z.number().int().positive().max(500).optional().describe('Pagination: results per page.'),
});

export const listConversions: CuratedTool<z.infer<typeof ListConversionsInput>> = {
  name: 'list_conversions',
  description:
    'List conversion events recorded against the authenticated profile. Conversions tie a recipient or sale back to the mail piece that drove it — used for attribution and ROI reporting. Use this to answer "what conversions came from my last campaign" or "show me recent conversion activity".',
  inputSchema: ListConversionsInput,
  handler: async (input, { client }) => client.get('/v1/conversions', input),
};

export const conversionTools: CuratedTool[] = [listConversions as CuratedTool];
