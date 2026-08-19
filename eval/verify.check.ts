/**
 * Deterministic self-check for the citation-verification math (no API key).
 *
 *   npx tsx eval/verify.check.ts
 *
 * Uses a mock entailer (evidence entails the claim iff it contains "GOOD") so the
 * ALCE recall/precision and kappa arithmetic is checked without any model calls.
 */
import assert from "node:assert/strict";
import type { RagAnswer, Passage } from "@/lib/rag/types";
import { scoreCitations, cohenKappa, type Entailer } from "@/lib/rag/verify";

const mock: Entailer = async (_claim, evidence) =>
  evidence.includes("GOOD") ? { label: "supported", score: 1 } : { label: "unsupported", score: 0 };

const seg = (text: string, ...citedTexts: string[]) => ({
  text,
  citations: citedTexts.map((t, i) => ({ sourceIndex: i + 1, citedText: t, passageId: `p${i}` })),
});

const answer = (segments: RagAnswer["segments"]): RagAnswer => ({
  segments,
  sources: [] as Passage[],
  abstained: false,
  model: "mock",
});

async function main() {
  const ans = answer([
    seg("Statement A is supported by one good span.", "GOOD span for A"), // recall 1, 1 relevant cite
    seg("Statement B has a padding citation.", "GOOD span for B", "irrelevant bad span"), // recall 1, 1 of 2 relevant
    seg("Statement C cites a span that does not support it.", "bad span"), // recall 0, lone cite stays relevant
    seg("This is a long uncited statement that should be flagged for transparency only."), // uncited (>=40 chars)
    seg(" and also"), // short connective — ignored entirely
  ]);

  const s = await scoreCitations(ans, mock);
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

  assert.equal(s.nStatements, 3, "3 cited statements");
  assert.equal(s.nCitations, 4, "4 citations total");
  assert.equal(s.nUncited, 1, "1 substantive uncited statement");
  assert.ok(near(s.recall, 2 / 3), `recall 2/3, got ${s.recall}`);
  assert.ok(near(s.precision, 3 / 4), `precision 3/4, got ${s.precision}`); // padding citation in B penalized

  // Cohen's kappa: perfect agreement = 1; chance-level agreement = 0.
  assert.ok(near(cohenKappa([true, false, true], [true, false, true]), 1), "kappa perfect = 1");
  assert.ok(near(cohenKappa([true, false, true, false], [true, false, false, true]), 0), "kappa chance = 0");

  console.log("verify.check: OK");
  console.log(`  recall=${s.recall.toFixed(3)} precision=${s.precision.toFixed(3)} ` +
    `nStatements=${s.nStatements} nCitations=${s.nCitations} nUncited=${s.nUncited}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
