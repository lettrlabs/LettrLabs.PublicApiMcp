import type { Request } from 'express';

/**
 * Context produced by an AuthProvider and threaded through to tool handlers.
 * v1 only carries an API key; future OAuth providers can return a bearer
 * token or richer principal here.
 */
export interface AuthContext {
  apiKey: string;
}

/**
 * Middleware that extracts caller credentials from an inbound HTTP request.
 * Implementations: ApiKeyAuthProvider (v1), OAuthAuthProvider (future).
 */
export interface AuthProvider {
  extract(req: Request): AuthContext | Promise<AuthContext>;
}
