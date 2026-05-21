import type { Express } from 'express';
import { ApiKeyAuthProvider } from './auth/apiKey.js';
import { createHttpApp } from './transport/http.js';

export const SERVER_NAME = 'lettrlabs-publicapi-mcp';
export const SERVER_VERSION = '0.1.0';

export interface AppEnv {
  lettrlabsApiBaseUrl: string;
}

/**
 * Build the Express app (without listening). Exposed for testability —
 * supertest / vitest hits this directly. index.ts is the process entry that
 * also calls .listen().
 */
export function createApp(env: AppEnv): Express {
  return createHttpApp({
    authProvider: new ApiKeyAuthProvider(),
    env: {
      serverName: SERVER_NAME,
      serverVersion: SERVER_VERSION,
      lettrlabsApiBaseUrl: env.lettrlabsApiBaseUrl,
    },
  });
}
