import corpusData from "@/data/corpus.json";
import type { Passage, RetrievedChunk } from "./types";
import { BM25, type Ranked } from "./bm25";
import { embedQuery, denseRank, hasEmbeddingIndex } from "./embeddings";
import { reciprocalRankFusion } from "./rrf";

/** A pluggable source of passages. Swap the in-process index for a real DB in production. */
export interface Corpus {
  search(query: string, k: number): Promise<RetrievedChunk[]>;
}

// Number of candidates each retriever contributes to fusion. Wider than k so a
// passage ranked, say, #12 by BM25 but #2 by embeddings still surfaces.
const CANDIDATES = 40;

/**
 * Hybrid retrieval over the bundled, embedded corpus — no database required.
 *
 *   1. Lexical: BM25 over normalized tokens (exact terms, names, "Article I").
 *   2. Dense:   cosine over precomputed OpenAI embeddings (paraphrase, concepts).
 *   3. Fuse:    Reciprocal Rank Fusion of the two rankings, then take top-k.
 *
 * Dense retrieval needs a live query embedding (OPENAI_API_KEY); without it the
 * engine degrades to BM25-only so the demo and eval still run with no keys. A
 * cross-encoder re-rank over the fused top ~30 would slot in before the slice.
 */
export class InProcessCorpus implements Corpus {
  private passages: Passage[];
  private byId: Map<string, Passage>;
  private bm25: BM25;

  constructor(passages?: Passage[]) {
    this.passages = passages ?? (corpusData as unknown as Passage[]);
    this.byId = new Map(this.passages.map((p) => [p.id, p]));
    this.bm25 = new BM25(this.passages.map((p) => ({ id: p.id, text: p.text })));
  }

  async search(query: string, k: number): Promise<RetrievedChunk[]> {
    const lexical = this.bm25.search(query).slice(0, CANDIDATES);

    let dense: Ranked[] = [];
    if (hasEmbeddingIndex()) {
      const qVec = await embedQuery(query);
      if (qVec) dense = denseRank(qVec).slice(0, CANDIDATES);
    }

    // Fuse when both signals exist; otherwise use whichever we have.
    const fused =
      dense.length > 0 ? reciprocalRankFusion([lexical, dense]) : lexical;

    return fused
      .slice(0, k)
      .map(({ id, score }) => ({ passage: this.byId.get(id)!, score }))
      .filter((c) => c.passage);
  }
}

/**
 * Production adapter over the real corpus (Supabase/Postgres + pgvector).
 *
 * Intended implementation (hybrid retrieval against the live DB):
 *   1. Lexical: full-text search over the English column AND a
 *      normalize_arabic()-indexed Arabic column — exact terms, names, numbers.
 *   2. Dense: embed the query, then pgvector `ORDER BY embedding <=> $vec LIMIT k`.
 *   3. Fuse with Reciprocal Rank Fusion (the same rrf.ts), then optionally
 *      re-rank the top ~30 with a cross-encoder before taking k.
 *
 * Left as a stub on purpose — this is the Phase-2 "Ask" path over the real
 * Shia Library corpus. Set CORPUS_BACKEND=supabase once it's wired up.
 */
export class SupabaseCorpus implements Corpus {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async search(_query: string, _k: number): Promise<RetrievedChunk[]> {
    throw new Error(
      "SupabaseCorpus is not configured. Implement hybrid retrieval against your " +
        "Postgres/pgvector corpus, or set CORPUS_BACKEND=mock to use the bundled corpus.",
    );
  }
}

let cached: Corpus | null = null;

export function getCorpus(): Corpus {
  if (cached) return cached;
  cached =
    process.env.CORPUS_BACKEND === "supabase"
      ? new SupabaseCorpus()
      : new InProcessCorpus();
  return cached;
}
