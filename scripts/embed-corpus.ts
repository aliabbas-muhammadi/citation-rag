/**
 * Precompute dense embeddings for every passage in data/corpus.json and write
 * data/corpus-embeddings.json (id -> vector). Run once after build:corpus.
 *
 * The corpus is public-domain text, so the embeddings are safe to commit — that
 * keeps the deployed app's dense index static (no DB), and only the *query*
 * embedding is computed live at request time.
 *
 *   OPENAI_API_KEY=sk-... npm run embed
 *
 * Uses OpenAI text-embedding-3-small (1536-d) to match the production corpus
 * (Shia Library), so the same retrieval code ports to the real DB later.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MODEL = "text-embedding-3-small";
const BATCH = 96;

type Passage = { id: string; text: string };

async function embedBatch(inputs: string[], key: string): Promise<number[][]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, input: inputs }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI embeddings ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { data: { embedding: number[] }[] };
  return data.data.map((d) => d.embedding);
}

// Round to 6 decimals to keep the committed JSON small without hurting cosine.
const round = (v: number) => Math.round(v * 1e6) / 1e6;

async function main() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is required to build the embedding index.");

  const corpusPath = join(process.cwd(), "data", "corpus.json");
  const corpus = JSON.parse(readFileSync(corpusPath, "utf8")) as Passage[];

  const out: Record<string, number[]> = {};
  for (let i = 0; i < corpus.length; i += BATCH) {
    const batch = corpus.slice(i, i + BATCH);
    const vectors = await embedBatch(
      batch.map((p) => p.text),
      key,
    );
    batch.forEach((p, j) => {
      out[p.id] = vectors[j].map(round);
    });
    console.log(`embedded ${Math.min(i + BATCH, corpus.length)}/${corpus.length}`);
  }

  const dim = Object.values(out)[0]?.length ?? 0;
  const outPath = join(process.cwd(), "data", "corpus-embeddings.json");
  writeFileSync(outPath, JSON.stringify({ model: MODEL, dim, vectors: out }) + "\n");
  console.log(`Wrote ${Object.keys(out).length} vectors (${dim}-d) → data/corpus-embeddings.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
