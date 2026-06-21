/**
 * Okapi BM25 lexical ranker — the keyword half of hybrid retrieval.
 *
 * BM25 beats raw TF-IDF on exact terms, names, and citation numbers (e.g.
 * "Article I, Section 8", "Amendment V") because of its term-frequency
 * saturation and length normalization — exactly the matches dense retrieval
 * tends to miss.
 */
import { tokenize } from "./text";

const K1 = 1.2;
const B = 0.75;

export type Ranked = { id: string; score: number };

type Doc = { id: string; tf: Map<string, number>; len: number };

export class BM25 {
  private docs: Doc[] = [];
  private df = new Map<string, number>();
  private avgdl = 0;

  constructor(items: { id: string; text: string }[]) {
    let total = 0;
    for (const it of items) {
      const tokens = tokenize(it.text);
      const tf = new Map<string, number>();
      for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      this.docs.push({ id: it.id, tf, len: tokens.length });
      total += tokens.length;
    }
    this.avgdl = total / Math.max(1, this.docs.length);
  }

  private idf(term: string): number {
    const n = this.docs.length;
    const df = this.df.get(term) ?? 0;
    // BM25 idf with +1 so common terms stay non-negative.
    return Math.log(1 + (n - df + 0.5) / (df + 0.5));
  }

  /** Rank all documents for a query; returns only docs with a positive score. */
  search(query: string): Ranked[] {
    const qTerms = [...new Set(tokenize(query))];
    const out: Ranked[] = [];
    for (const d of this.docs) {
      let score = 0;
      for (const t of qTerms) {
        const f = d.tf.get(t);
        if (!f) continue;
        const denom = f + K1 * (1 - B + (B * d.len) / this.avgdl);
        score += this.idf(t) * ((f * (K1 + 1)) / denom);
      }
      if (score > 0) out.push({ id: d.id, score });
    }
    return out.sort((a, b) => b.score - a.score);
  }
}
