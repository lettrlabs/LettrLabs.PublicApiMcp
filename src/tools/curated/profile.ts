import { z } from 'zod';
import type { CuratedTool } from '../types.js';

export const getMyProfile: CuratedTool<Record<string, never>> = {
  name: 'get_my_profile',
  description:
    'Get account/profile information for the authenticated LettrLabs API key: company name, billing details, prepaid balance, plan info. Use this to answer "what account am I on", "what\'s my balance", or "who am I logged in as".',
  inputSchema: z.object({}).strict(),
  handler: async (_input, { client }) => client.get('/v1/me'),
};

export const profileTools: CuratedTool[] = [getMyProfile as CuratedTool];
