/**
 * Tiny in-memory answer cache for the public demo. A repeated question replays
 * its previously streamed answer — the full ordered list of NDJSON events — so
 * we don't re-pay retrieval + generation, and the replay still arrives as a
 * stream the existing UI consumes unchanged.
 *
 * Per-instance (like the route's rate limiter), 24h TTL, LRU-capped. Production
 * would use a shared store (Redis/Upstash) — the same note as the rate limit.
 */
type Entry = { events: unknown[]; at: number };

const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 200;
const store = new Map<string, Entry>();

function norm(question: string): string {
  return question.trim().toLowerCase().replace(/\s+/g, " ");
}

/** The cached event list for a question, or null on miss / expiry. */
export function getCachedEvents(question: string): unknown[] | null {
  const key = norm(question);
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    store.delete(key);
    return null;
  }
  // LRU touch: re-insert so it counts as most-recently-used.
  store.delete(key);
  store.set(key, hit);
  return hit.events;
}

/** Store a completed exchange's events for cheap replay. */
export function setCachedEvents(question: string, events: unknown[]): void {
  store.set(norm(question), { events, at: Date.now() });
  // Map preserves insertion order, so the first key is the oldest.
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}
