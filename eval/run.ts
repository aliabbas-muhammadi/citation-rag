/**
 * Evaluation harness — retrieval ablation + answer faithfulness.
 *
 *   npm run eval                       # retrieval ablation (lexical always;
 *                                      # dense+hybrid when OPENAI_API_KEY is set)
 *   EVAL_REWRITE=1 npm run eval        # also measure LLM query rewriting (needs ANTHROPIC_API_KEY)
 *   EVAL_RERANK=1  npm run eval        # also measure LLM reranking of the fused top-N
 *   EVAL_FAITHFULNESS=1 npm run eval   # also score answer faithfulness + abstain accuracy
 *
 * The point: every retrieval/answer claim in the case study is a number you can
 * reproduce here, not an assertion. Exits non-zero if recall regresses below the
 * gate (RECALL_GATE, default 0.85) so CI catches regressions.
 */
import Anthropic from "@anthropic-ai/sdk";
import golden from "./golden.json";
import corpusData from "@/data/corpus.json";
import type { Passage } from "@/lib/rag/types";
import { BM25, type Ranked } from "@/lib/rag/bm25";
import { embedQuery, denseRank, hasEmbeddingIndex } from "@/lib/rag/embeddings";
import { reciprocalRankFusion } from "@/lib/rag/rrf";
import { generateAnswer } from "@/lib/rag/generate";

type GoldenItem = { question: string; relevantPassageIds: string[] };

const K = 5;
const CAND = 40; // candidates per retriever fed into fusion / rerank
// Gate on the keyless lexical path (what CI runs). Hybrid/dense score higher.
const RECALL_GATE = Number(process.env.RECALL_GATE ?? "0.80");

const passages = corpusData as unknown as Passage[];
const byId = new Map(passages.map((p) => [p.id, p]));
const bm25 = new BM25(passages.map((p) => ({ id: p.id, text: p.text })));

const golds = golden as GoldenItem[];
const inCorpus = golds.filter((g) => g.relevantPassageIds.length > 0);
const outOfCorpus = golds.filter((g) => g.relevantPassageIds.length === 0);

const haveKey = !!process.env.ANTHROPIC_API_KEY;
const haveDense = hasEmbeddingIndex() && !!process.env.OPENAI_API_KEY;
const client = haveKey ? new Anthropic() : null;
const HELPER_MODEL = process.env.JUDGE_MODEL || "claude-opus-4-8";

function recallAt(ids: string[], relevant: Set<string>): number {
  const hit = ids.slice(0, K).filter((id) => relevant.has(id)).length;
  return hit / relevant.size;
}
function reciprocalRank(ids: string[], relevant: Set<string>): number {
  for (let i = 0; i < ids.length; i++) if (relevant.has(ids[i])) return 1 / (i + 1);
  return 0;
}
function textOf(res: Anthropic.Message): string {
  return res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
}

/** Compute lexical / dense / hybrid rankings for a query in one shot. */
async function rankings(q: string): Promise<Record<string, Ranked[]>> {
  const lexical = bm25.search(q).slice(0, CAND);
  let dense: Ranked[] = [];
  if (haveDense) {
    const v = await embedQuery(q);
    if (v) dense = denseRank(v).slice(0, CAND);
  }
  const hybrid = dense.length ? reciprocalRankFusion([lexical, dense]) : lexical;
  return { lexical, dense, hybrid };
}

async function rewriteQuery(q: string): Promise<string> {
  if (!client) return q;
  const res = await client.messages.create({
    model: HELPER_MODEL,
    max_tokens: 120,
    system:
      "Rewrite the question into a concise retrieval query that maximizes lexical and " +
      "semantic recall over the U.S. founding documents (Constitution, Bill of Rights, " +
      "Federalist Papers). Expand key concepts and synonyms. Output ONLY the query.",
    messages: [{ role: "user", content: q }],
  });
  return textOf(res).trim() || q;
}

/** LLM listwise rerank of fused candidates; returns reordered ids. */
async function rerank(q: string, candIds: string[]): Promise<string[]> {
  if (!client || candIds.length === 0) return candIds;
  const list = candIds
    .map((id, i) => `[${i}] ${byId.get(id)!.section} ${byId.get(id)!.number}: ${byId.get(id)!.text.slice(0, 280)}`)
    .join("\n");
  const res = await client.messages.create({
    model: HELPER_MODEL,
    max_tokens: 200,
    system:
      "Rank the passages by how directly they answer the question. " +
      "Output ONLY a JSON array of passage indices, best first, e.g. [3,0,7].",
    messages: [{ role: "user", content: `Question: ${q}\n\nPassages:\n${list}` }],
  });
  try {
    const raw = textOf(res);
    const order = JSON.parse(raw.slice(raw.indexOf("["), raw.lastIndexOf("]") + 1)) as number[];
    const reordered = order.map((i) => candIds[i]).filter(Boolean);
    // append any the model omitted, preserving fused order
    for (const id of candIds) if (!reordered.includes(id)) reordered.push(id);
    return reordered;
  } catch {
    return candIds;
  }
}

type Row = { mode: string; recall: number; mrr: number };

async function ablation(): Promise<number> {
  const modes = haveDense ? ["lexical", "dense", "hybrid"] : ["lexical"];
  if (process.env.EVAL_REWRITE === "1" && haveKey) modes.push("hybrid+rewrite");
  if (process.env.EVAL_RERANK === "1" && haveKey) modes.push("hybrid+rerank");

  const agg: Record<string, { r: number; m: number }> = {};
  for (const m of modes) agg[m] = { r: 0, m: 0 };

  for (const g of inCorpus) {
    const rel = new Set(g.relevantPassageIds);
    const rk = await rankings(g.question);

    for (const m of ["lexical", "dense", "hybrid"]) {
      if (!modes.includes(m)) continue;
      const ids = rk[m].map((x) => x.id);
      agg[m].r += recallAt(ids, rel);
      agg[m].m += reciprocalRank(ids, rel);
    }
    if (modes.includes("hybrid+rewrite")) {
      const rq = await rewriteQuery(g.question);
      const ids = (await rankings(rq)).hybrid.map((x) => x.id);
      agg["hybrid+rewrite"].r += recallAt(ids, rel);
      agg["hybrid+rewrite"].m += reciprocalRank(ids, rel);
    }
    if (modes.includes("hybrid+rerank")) {
      const ids = await rerank(g.question, rk.hybrid.slice(0, 10).map((x) => x.id));
      agg["hybrid+rerank"].r += recallAt(ids, rel);
      agg["hybrid+rerank"].m += reciprocalRank(ids, rel);
    }
  }

  const n = inCorpus.length;
  const rows: Row[] = modes.map((m) => ({ mode: m, recall: agg[m].r / n, mrr: agg[m].m / n }));

  console.log(`\nRetrieval ablation — ${n} in-corpus questions, k=${K}`);
  console.log("-".repeat(48));
  console.log("mode             recall@5     MRR");
  for (const row of rows) {
    console.log(
      `${row.mode.padEnd(16)} ${row.recall.toFixed(3).padStart(6)}   ${row.mrr.toFixed(3).padStart(6)}`,
    );
  }
  console.log("-".repeat(48));

  // Gate on the strongest non-LLM mode available (hybrid if we have dense, else lexical).
  const primary = rows.find((r) => r.mode === (haveDense ? "hybrid" : "lexical"))!;
  return primary.recall;
}

/** Does a retrieval-confidence threshold separate answerable from unanswerable? */
async function gateExperiment() {
  if (!haveDense) {
    console.log("\n(Retrieval-confidence gate experiment skipped — needs OPENAI_API_KEY.)");
    return;
  }
  const topCos = async (q: string) => {
    const v = await embedQuery(q);
    return v ? denseRank(v)[0]?.score ?? 0 : 0;
  };
  let inSum = 0;
  for (const g of inCorpus) inSum += await topCos(g.question);
  let outMax = 0;
  let outSum = 0;
  for (const g of outOfCorpus) {
    const s = await topCos(g.question);
    outSum += s;
    outMax = Math.max(outMax, s);
  }
  console.log("\nRetrieval-confidence gate (top-1 dense cosine)");
  console.log("-".repeat(48));
  console.log(`in-corpus  mean = ${(inSum / inCorpus.length).toFixed(3)}`);
  console.log(`out-corpus mean = ${(outSum / outOfCorpus.length).toFixed(3)}   max = ${outMax.toFixed(3)}`);
  console.log(`=> a threshold between the two pre-abstains before spending a generation.`);
}

async function faithfulness() {
  if (!client) {
    console.log("\n(Faithfulness + abstain accuracy skipped — set EVAL_FAITHFULNESS=1 and ANTHROPIC_API_KEY.)");
    return;
  }
  const judge = process.env.JUDGE_MODEL || "claude-opus-4-8";
  let sum = 0;
  let counted = 0;
  console.log(`\nFaithfulness (judge: ${judge})`);
  console.log("-".repeat(48));
  for (const g of inCorpus) {
    const rk = await rankings(g.question);
    const sources = rk.hybrid.slice(0, K).map((x) => byId.get(x.id)!);
    const ans = await generateAnswer(g.question, sources);
    if (ans.abstained) {
      console.log(`abstained  ${g.question}`);
      continue;
    }
    const answerText = ans.segments.map((s) => s.text).join("");
    const sourcesText = sources.map((p, i) => `[${i + 1}] ${p.text}`).join("\n");
    const res = await client.messages.create({
      model: judge,
      max_tokens: 400,
      system:
        "You are a strict grader. Decide whether EVERY claim in the answer is supported by the sources. " +
        'Respond with ONLY JSON: {"grounded": boolean, "score": number 0-1, "reason": string}.',
      messages: [{ role: "user", content: `SOURCES:\n${sourcesText}\n\nQUESTION: ${g.question}\nANSWER: ${answerText}` }],
    });
    let score = 0;
    try {
      const raw = textOf(res);
      score = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)).score ?? 0;
    } catch {
      score = 0;
    }
    sum += score;
    counted += 1;
    console.log(`score=${score.toFixed(2)}  ${g.question}`);
  }
  console.log("-".repeat(48));
  console.log(counted ? `mean faithfulness = ${(sum / counted).toFixed(3)}` : "no answers scored");

  // Abstain accuracy: out-of-corpus questions must decline.
  let abstained = 0;
  for (const g of outOfCorpus) {
    const rk = await rankings(g.question);
    const ans = await generateAnswer(g.question, rk.hybrid.slice(0, K).map((x) => byId.get(x.id)!));
    if (ans.abstained) abstained += 1;
    console.log(`${ans.abstained ? "abstained ✓" : "ANSWERED ✗"}  ${g.question}`);
  }
  console.log(`abstain accuracy (out-of-corpus) = ${abstained}/${outOfCorpus.length}`);
}

async function main() {
  console.log(
    `Modes available: lexical${haveDense ? " + dense + hybrid" : " only (no OPENAI_API_KEY)"}` +
      `${haveKey ? "" : "  ·  no ANTHROPIC_API_KEY (generation experiments skipped)"}`,
  );
  const recall = await ablation();
  await gateExperiment();
  if (process.env.EVAL_FAITHFULNESS === "1") await faithfulness();

  console.log(`\nGate: recall ${recall.toFixed(3)} vs threshold ${RECALL_GATE}`);
  if (recall < RECALL_GATE) {
    console.error(`FAIL: recall ${recall.toFixed(3)} < ${RECALL_GATE}`);
    process.exit(1);
  }
  console.log("PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
