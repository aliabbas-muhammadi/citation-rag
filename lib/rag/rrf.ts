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
