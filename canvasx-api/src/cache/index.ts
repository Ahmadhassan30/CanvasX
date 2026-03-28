import { createHash } from "crypto";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const TTL_MS = 60 * 60 * 1000; // 1 hour

const store = new Map<string, CacheEntry<unknown>>();

/**
 * Generates a SHA-256 hex digest of an arbitrary input string.
 * Used as the canonical cache key.
 */
export function hashKey(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Retrieve a cached value by its SHA-256 hashed key.
 * Returns undefined on miss or expiry (stale entries are pruned lazily).
 */
export function get<T>(key: string): T | undefined {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return undefined;

  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }

  console.log(`[cache] HIT  key=${key.slice(0, 12)}…`);
  return entry.value;
}

/**
 * Store a value under a SHA-256 hashed key with a 1-hour TTL.
 */
export function set<T>(key: string, value: T): void {
  store.set(key, { value, expiresAt: Date.now() + TTL_MS });
}

/**
 * Evict all entries regardless of TTL.
 */
export function clear(): void {
  store.clear();
  console.log("[cache] CLEARED");
}

/**
 * Return the number of live (non-expired) entries currently held.
 */
export function size(): number {
  let count = 0;
  const now = Date.now();
  for (const entry of store.values()) {
    if (now <= entry.expiresAt) count++;
  }
  return count;
}
