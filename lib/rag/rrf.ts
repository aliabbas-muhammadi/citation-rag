/**
 * Reciprocal Rank Fusion — combines lexical (BM25) and dense (embedding)
 * rankings into one list without needing the two score scales to be comparable.
 *
 * Each list contributes 1 / (k + rank) to a passage's fused score; k=60 is the
 * value from the original RRF paper (Cormack et al.) and is robust in practice.
 */
import type { Ranked } from "./bm25";

const K = 60;

export function reciprocalRankFusion(lists: Ranked[][], k = K): Ranked[] {
  const fused = new Map<string, number>();
  for (const list of lists) {
    list.forEach((item, rank) => {
      fused.set(item.id, (fused.get(item.id) ?? 0) + 1 / (k + rank + 1));
    });
  }
  return [...fused.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Source-diversity cap: keep at most `cap` passages from any one source
 * document, preserving fused order. A single multi-passage document (e.g. one
 * Federalist essay, which contributes ~17 paragraph passages) can otherwise
 * flood the top-k and starve the answer of corroborating sources — the same
 * pathology the Shia Library "Ask" hit with one giant book. Overflow passages
 * are *appended* after the capped ones, so nothing is dropped: they just lose
 * their top slots to more diverse sources before the final `slice(0, k)`.
 */
export function capPerSource(
  ranked: Ranked[],
  sourceOf: (id: string) => string | undefined,
  cap: number,
): Ranked[] {
  if (cap <= 0) return ranked;
  const counts = new Map<string, number>();
  const kept: Ranked[] = [];
  const overflow: Ranked[] = [];
  for (const item of ranked) {
    const src = sourceOf(item.id) ?? item.id;
    const n = counts.get(src) ?? 0;
    if (n < cap) {
      counts.set(src, n + 1);
      kept.push(item);
    } else {
      overflow.push(item);
    }
  }
  return [...kept, ...overflow];
}
