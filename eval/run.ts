/**
 * Evaluation harness.
 *
 *   npm run eval                     # retrieval metrics only (offline, no key)
 *   EVAL_FAITHFULNESS=1 npm run eval # also score answer faithfulness (needs ANTHROPIC_API_KEY)
 *
 * Retrieval: recall@k and MRR against a golden set.
 * Faithfulness: an LLM judge checks each generated answer is supported by its
 * cited sources (the metric that separates "looks right" from "is grounded").
 */
import Anthropic from "@anthropic-ai/sdk";
import golden from "./golden.json";
import { retrieve } from "@/lib/rag/retrieve";
import { generateAnswer } from "@/lib/rag/generate";

type GoldenItem = { question: string; relevantPassageIds: string[] };
const K = 5;

async function retrievalMetrics() {
  let sumRecall = 0;
  let sumMrr = 0;
  console.log(`\nRetrieval @ k=${K}\n${"-".repeat(64)}`);
  for (const g of golden as GoldenItem[]) {
    const chunks = await retrieve(g.question, K);
    const ids = chunks.map((c) => c.passage.id);
    const relevant = new Set(g.relevantPassageIds);
    const recall = ids.filter((id) => relevant.has(id)).length / relevant.size;
    let rr = 0;
    for (let i = 0; i < ids.length; i++) {
      if (relevant.has(ids[i])) {
        rr = 1 / (i + 1);
        break;
      }
    }
    sumRecall += recall;
    sumMrr += rr;
    console.log(
      `recall=${recall.toFixed(2)}  rr=${rr.toFixed(2)}  ${g.question}`,
    );
  }
  const n = golden.length;
  console.log("-".repeat(64));
  console.log(
    `mean recall@${K} = ${(sumRecall / n).toFixed(3)}   MRR = ${(sumMrr / n).toFixed(3)}`,
  );
}

async function faithfulness() {
  const client = new Anthropic();
  const model = process.env.JUDGE_MODEL || "claude-opus-4-8";
  let sum = 0;
  let counted = 0;
  console.log(`\nFaithfulness (judge: ${model})\n${"-".repeat(64)}`);
  for (const g of golden as GoldenItem[]) {
    const ans = await generateAnswer(
      g.question,
      (await retrieve(g.question, K)).map((c) => c.passage),
    );
    if (ans.abstained) {
      console.log(`abstained        ${g.question}`);
      continue;
    }
    const answerText = ans.segments.map((s) => s.text).join("");
    const sourcesText = ans.sources.map((p, i) => `[${i + 1}] ${p.text}`).join("\n");

    const res = await client.messages.create({
      model,
      max_tokens: 400,
      system:
        "You are a strict grader. Decide whether EVERY claim in the answer is supported by the provided sources. " +
        'Respond with ONLY a JSON object: {"grounded": boolean, "score": number 0-1, "reason": string}. ' +
        "Score 1.0 if fully supported, 0.0 if it contains unsupported claims, partial otherwise.",
      messages: [
        {
          role: "user",
          content: `SOURCES:\n${sourcesText}\n\nQUESTION: ${g.question}\nANSWER: ${answerText}`,
        },
      ],
    });
    const block = res.content.find((b) => b.type === "text") as { text: string } | undefined;
    let score = 0;
    try {
      const raw = block?.text ?? "{}";
      const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
      score = JSON.parse(json).score ?? 0;
    } catch {
      score = 0;
    }
    sum += score;
    counted += 1;
    console.log(`score=${score.toFixed(2)}        ${g.question}`);
  }
  console.log("-".repeat(64));
  console.log(
    counted ? `mean faithfulness = ${(sum / counted).toFixed(3)}` : "no answers scored",
  );
}

async function main() {
  await retrievalMetrics();
  if (process.env.EVAL_FAITHFULNESS === "1" && process.env.ANTHROPIC_API_KEY) {
    await faithfulness();
  } else {
    console.log(
      "\n(Faithfulness judge skipped — set EVAL_FAITHFULNESS=1 and ANTHROPIC_API_KEY to enable.)",
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
