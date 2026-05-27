/**
 * In-memory store for one-time OAuth authorization codes.
 *
 * Codes are short-lived (5 min) and consumed exactly once on /token exchange.
 * Single-pod only — if we ever scale to multiple replicas, this needs Redis or
 * similar shared state. For nonprod demo (1-2 pods), in-memory is fine.
 */

import { randomBytes } from 'node:crypto';

export interface AuthorizationCodeEntry {
  /** The LettrLabs API key the user pasted on the consent page. */
  apiKey: string;
  /** PKCE code_challenge submitted at /authorize (S256). */
  codeChallenge: string;
  /** Echo of the client's redirect_uri so we can compare at /token time. */
  redirectUri: string;
  /** Client ID from the authorize request. */
  clientId: string;
  /** When this code expires (epoch ms). */
  expiresAt: number;
}

const CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ENTRIES = 1000;

const store = new Map<string, AuthorizationCodeEntry>();

export function mintCode(entry: Omit<AuthorizationCodeEntry, 'expiresAt'>): string {
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  const code = randomBytes(32).toString('base64url');
  store.set(code, { ...entry, expiresAt: Date.now() + CODE_TTL_MS });
  return code;
}

/**
 * Consume a code: returns the entry and deletes it (codes are one-time).
 * Returns null if the code is missing or expired.
 */
export function consumeCode(code: string): AuthorizationCodeEntry | null {
  const entry = store.get(code);
  if (!entry) return null;
  store.delete(code);
  if (entry.expiresAt < Date.now()) return null;
  return entry;
}

/** Test helper. */
export function clearCodes(): void {
  store.clear();
}
