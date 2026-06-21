import sampleCorpus from "@/data/sample-corpus.json";
import type { Passage, RetrievedChunk } from "./types";

/** A pluggable source of passages. Swap the mock for a real DB in production. */
export interface Corpus {
  search(query: string, k: number): Promise<RetrievedChunk[]>;
}

/* --------------------------------------------------------------------------
   Text normalization — diacritic-insensitive, with light Arabic folding.
   This mirrors the normalize_arabic() approach used in Shia Library so the
   mock retriever behaves like the real corpus on Arabic/transliterated input.
   -------------------------------------------------------------------------- */
function normalizeArabic(s: string): string {
  return s
    .replace(/[ً-ٰٟ]/g, "") // harakat (short vowels)
    .replace(/ـ/g, "") // tatweel (elongation)
    .replace(/[آأإ]/g, "ا") // alef variants -> bare alef
    .replace(/ى/g, "ي"); // alef maqsura -> ya
}

function normalize(s: string): string {
  return normalizeArabic(s.toLowerCase()).replace(/[^\p{L}\p{N}\s]/gu, " ");
}

const STOPWORDS = new Set(
  ("a an and are as at be by do does for from has have how in into is it its of on or " +
    "that the this to was were what when where which who why with you your").split(" "),
);

function tokenize(s: string): string[] {
  return normalize(s)
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    // naive plural folding, applied symmetrically to query and corpus
    .map((t) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t));
}

/**
 * In-memory corpus over a bundled sample, scored with a small TF-IDF + phrase
 * bonus. Zero external dependencies, so the demo and the eval harness run with
 * no database and no API key.
 */
export class MockCorpus implements Corpus {
  private passages: Passage[];
  private df = new Map<string, number>();

  constructor(passages?: Passage[]) {
    this.passages = passages ?? (sampleCorpus as Passage[]);

    for (const p of this.passages) {
      const seen = new Set(tokenize(p.text));
      for (const t of seen) this.df.set(t, (this.df.get(t) ?? 0) + 1);
    }
  }

  private idf(term: string): number {
    const n = this.passages.length;
    const df = this.df.get(term) ?? 0;
    return Math.log((n + 1) / (df + 0.5));
  }

  async search(query: string, k: number): Promise<RetrievedChunk[]> {
    const qTokens = tokenize(query);
    const qNorm = normalize(query).trim();

    const scored = this.passages.map((passage) => {
      const pTokens = tokenize(passage.text);
      const pSet = new Set(pTokens);
      let score = 0;
      for (const t of qTokens) if (pSet.has(t)) score += this.idf(t);
      // length normalization so short passages aren't unfairly penalized
      score = score / Math.sqrt(pTokens.length || 1);
      // phrase bonus: reward an exact normalized substring match
      if (qNorm.length > 0 && normalize(passage.text).includes(qNorm)) {
        score += 2;
      }
      return { passage, score };
    });

    return scored
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}

/**
 * Production adapter over the real corpus (Supabase/Postgres + pgvector).
 *
 * Intended implementation (hybrid retrieval):
 *   1. Lexical: full-text search over the English column AND a
 *      normalize_arabic()-indexed Arabic column (GIN trigram) — exact terms,
 *      names, and citation numbers.
 *   2. Dense: embed the query (OpenAI/Voyage), then pgvector
 *      `ORDER BY embedding <=> $queryEmbedding LIMIT k`.
 *   3. Fuse the two result sets with Reciprocal Rank Fusion, then (optionally)
 *      re-rank the top ~30 with a cross-encoder before taking the top k.
 *
 * Left as a stub on purpose — wire it to your DB when you move off the sample.
 */
export class SupabaseCorpus implements Corpus {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async search(_query: string, _k: number): Promise<RetrievedChunk[]> {
    throw new Error(
      "SupabaseCorpus is not configured. Implement hybrid retrieval against your " +
        "Postgres/pgvector corpus, or set CORPUS_BACKEND=mock to use the sample.",
    );
  }
}

export function getCorpus(): Corpus {
  return process.env.CORPUS_BACKEND === "supabase"
    ? new SupabaseCorpus()
    : new MockCorpus();
}
