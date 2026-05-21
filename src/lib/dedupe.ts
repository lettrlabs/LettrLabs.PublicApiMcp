import { createHash } from 'node:crypto';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * MCP-layer write-tool dedupe.
 *
 * In-memory LRU keyed by a stable hash of (tool, apiKey, body, time-bucket).
 * Returns the cached prior result if the same tool was called with the same
 * arguments by the same caller within the configured time window.
 *
 * This is a v1 stopgap because LettrLabs.App doesn't yet honor inbound
 * Idempotency-Key headers. Once that ships, dedupe at the MCP layer can be
 * removed and replaced with forwarded idempotency keys.
 */
export class DedupeCache {
  private readonly cache = new Map<string, CacheEntry<unknown>>();

  constructor(
    private readonly maxSize: number,
    private readonly windowMs: number,
  ) {}

  static computeKey(opts: {
    tool: string;
    apiKey: string;
    body: unknown;
    bucketSeconds: number;
  }): string {
    const apiKeyHash = createHash('sha256').update(opts.apiKey).digest('hex').slice(0, 16);
    const bucket = Math.floor(Date.now() / 1000 / opts.bucketSeconds);
    const stable = JSON.stringify({
      tool: opts.tool,
      apiKeyHash,
      body: opts.body ?? null,
      bucket,
    });
    return createHash('sha256').update(stable).digest('hex');
  }

  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return undefined;
    }
    // Refresh insertion order so frequently-hit entries don't get evicted.
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value as T;
  }

  set<T>(key: string, value: T): void {
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }
    this.cache.set(key, { value, expiresAt: Date.now() + this.windowMs });
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

const DEFAULT_WINDOW_SECONDS = Number(process.env.DEDUPE_WINDOW_SECONDS ?? 60);
const DEFAULT_CACHE_SIZE = Number(process.env.DEDUPE_CACHE_SIZE ?? 1000);

export const dedupeCache = new DedupeCache(DEFAULT_CACHE_SIZE, DEFAULT_WINDOW_SECONDS * 1000);
export const DEDUPE_BUCKET_SECONDS = DEFAULT_WINDOW_SECONDS;

/**
 * Wrap a write-tool call with dedupe. If the same (tool, apiKey, body) combo
 * was seen inside the dedupe window, the cached result is returned without
 * re-invoking `call`.
 */
export async function dedupedCall<T>(
  toolName: string,
  apiKey: string,
  body: unknown,
  call: () => Promise<T>,
): Promise<T> {
  const key = DedupeCache.computeKey({
    tool: toolName,
    apiKey,
    body,
    bucketSeconds: DEDUPE_BUCKET_SECONDS,
  });
  const cached = dedupeCache.get<T>(key);
  if (cached !== undefined) return cached;
  const result = await call();
  dedupeCache.set(key, result);
  return result;
}
