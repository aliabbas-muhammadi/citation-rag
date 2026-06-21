/**
 * Dense retrieval — the semantic half of hybrid retrieval.
 *
 * Corpus vectors are precomputed (scripts/embed-corpus.ts) and bundled, so the
 * dense index ships static with no database. Only the *query* embedding is
 * computed live, via OpenAI text-embedding-3-small (1536-d) — the same model
 * the production corpus uses, so this ports unchanged to pgvector later.
 *
 * Degrades gracefully: with no OPENAI_API_KEY (or on any API error), embedQuery
 * returns null and the caller falls back to BM25-only retrieval.
 */
import embeddingIndex from "@/data/corpus-embeddings.json";
import type { Ranked } from "./bm25";

const MODEL = "text-embedding-3-small";

type Index = { model: string; dim: number; vectors: Record<string, number[]> };
const INDEX = embeddingIndex as Index;

export function hasEmbeddingIndex(): boolean {
  return Object.keys(INDEX.vectors).length > 0;
}

export async function embedQuery(query: string): Promise<number[] | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, input: query }),
    });
    if (!res.ok) {
      console.error(`embedQuery: OpenAI ${res.status}`);
      return null;
    }
    const data = (await res.json()) as { data: { embedding: number[] }[] };
    return data.data[0]?.embedding ?? null;
  } catch (err) {
    console.error("embedQuery failed:", err);
    return null;
  }
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/** Rank every corpus passage by cosine similarity to the query vector. */
export function denseRank(queryVec: number[]): Ranked[] {
  const out: Ranked[] = [];
  for (const [id, vec] of Object.entries(INDEX.vectors)) {
    out.push({ id, score: cosine(queryVec, vec) });
  }
  return out.sort((a, b) => b.score - a.score);
}
