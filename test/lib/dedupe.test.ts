import { describe, expect, it } from 'vitest';
import { DedupeCache } from '../../src/lib/dedupe.js';

describe('DedupeCache', () => {
  it('returns cached value within the window', () => {
    const cache = new DedupeCache(10, 1000);
    cache.set('k', { value: 1 });
    expect(cache.get('k')).toEqual({ value: 1 });
  });

  it('evicts the oldest entry when capacity is reached', () => {
    const cache = new DedupeCache(2, 1000);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
  });

  it('expires entries past the window', async () => {
    const cache = new DedupeCache(10, 10);
    cache.set('k', 'v');
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(cache.get('k')).toBeUndefined();
  });

  it('computes deterministic keys for the same inputs in the same bucket', () => {
    const a = DedupeCache.computeKey({
      tool: 't',
      apiKey: 'key',
      body: { x: 1 },
      bucketSeconds: 60,
    });
    const b = DedupeCache.computeKey({
      tool: 't',
      apiKey: 'key',
      body: { x: 1 },
      bucketSeconds: 60,
    });
    expect(a).toEqual(b);
  });

  it('produces different keys for different api keys', () => {
    const a = DedupeCache.computeKey({
      tool: 't',
      apiKey: 'key-1',
      body: { x: 1 },
      bucketSeconds: 60,
    });
    const b = DedupeCache.computeKey({
      tool: 't',
      apiKey: 'key-2',
      body: { x: 1 },
      bucketSeconds: 60,
    });
    expect(a).not.toEqual(b);
  });
});
