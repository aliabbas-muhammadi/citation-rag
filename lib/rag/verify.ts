/**
 * Citation verification — does each cited span actually *entail* the claim it
 * supports? Native Anthropic citations guarantee provenance (the span exists in
 * the source) but not entailment (that the span logically supports the claim).
 * This closes that gap with an independent verifier and reports the canonical
 * attribution metrics.
 *
 * Metrics follow ALCE (Gao et al., EMNLP 2023, arXiv:2305.14627):
 *   - citation RECALL:    a statement is supported iff its cited spans, taken
 *                         together, entail it.
 *   - citation PRECISION: a citation is *irrelevant* iff it alone does not entail
 *                         the statement AND removing it doesn't break support
 *                         (i.e. it's padding). Precision = relevant / total.
 * Report both — precision alone is gameable by under-citing.
 *
 * The verifier itself is fallible (attribution judging tops out well below 100%,
 * and NLI models are trained on modern English while this corpus is 18th-century
 * text), so we also measure the verifier against a human-labeled slice and report
 * its own agreement — disclose your measurer, don't just trust it.
 */
import type { AnswerSegment, RagAnswer } from "./types";

export type EntailmentLabel = "supported" | "partial" | "unsupported";

export type EntailmentResult = { label: EntailmentLabel; score: number };

/** Does `evidence` entail `claim`? Judge from the evidence alone, not world knowledge. */
export type Entailer = (claim: string, evidence: string) => Promise<EntailmentResult>;

/** Only full support counts as entailment for the binary ALCE metric. */
export const entails = (r: EntailmentResult): boolean => r.label === "supported";

/** A claim (answer statement) paired with the exact spans cited to support it. */
export type StatementCitations = { claim: string; evidences: string[] };

export type CitationScore = {
  /** Fraction of cited statements whose citations together entail them. */
  recall: number;
  /** Fraction of citations that are relevant (not padding). */
  precision: number;
  /** Cited statements scored. */
  nStatements: number;
  /** Citations scored across those statements. */
  nCitations: number;
  /** Substantive statements that carried no citation at all (transparency). */
  nUncited: number;
};

/** A statement long enough to plausibly carry a factual claim (vs. connective text). */
const MIN_CLAIM_LEN = 40;

/** Extract (claim, cited spans) pairs from a generated answer. */
export function statementsFromAnswer(ans: RagAnswer): {
  cited: StatementCitations[];
  uncited: StatementCitations[];
} {
  const cited: StatementCitations[] = [];
  const uncited: StatementCitations[] = [];
  for (const seg of ans.segments) {
    const claim = seg.text.trim();
    if (!claim) continue;
    const evidences = seg.citations.map((c) => c.citedText).filter((t) => t.trim().length > 0);
    if (evidences.length > 0) cited.push({ claim, evidences });
    else if (claim.length >= MIN_CLAIM_LEN) uncited.push({ claim, evidences: [] });
  }
  return { cited, uncited };
}

/**
 * Score one answer's citations with ALCE recall/precision, using `entail` as the
 * (fallible) entailment oracle. Deterministic given a deterministic `entail`.
 */
export async function scoreCitations(
  ans: RagAnswer,
  entail: Entailer,
): Promise<CitationScore> {
  const { cited, uncited } = statementsFromAnswer(ans);

  let recallHits = 0;
  let relevantCites = 0;
  let totalCites = 0;

  for (const s of cited) {
    const all = s.evidences.join("\n\n");
    if (entails(await entail(s.claim, all))) recallHits += 1;

    for (let i = 0; i < s.evidences.length; i += 1) {
      totalCites += 1;
      const alone = entails(await entail(s.claim, s.evidences[i]));
      // Single citation can't be redundant: removing it always breaks support.
      const rest = s.evidences.filter((_, j) => j !== i);
      const restEntails = rest.length > 0 && entails(await entail(s.claim, rest.join("\n\n")));
      // Irrelevant (padding) iff it alone doesn't support AND the rest still does.
      const irrelevant = !alone && restEntails;
      if (!irrelevant) relevantCites += 1;
    }
  }

  return {
    recall: cited.length ? recallHits / cited.length : 0,
    precision: totalCites ? relevantCites / totalCites : 0,
    nStatements: cited.length,
    nCitations: totalCites,
    nUncited: uncited.length,
  };
}

/** Per-claim label for the UI badge (Phase 2): supported / partial / unsupported. */
export async function labelStatements(
  ans: RagAnswer,
  entail: Entailer,
): Promise<{ segment: AnswerSegment; result: EntailmentResult }[]> {
  const out: { segment: AnswerSegment; result: EntailmentResult }[] = [];
  for (const seg of ans.segments) {
    const evidences = seg.citations.map((c) => c.citedText).filter((t) => t.trim());
    if (evidences.length === 0) continue;
    out.push({ segment: seg, result: await entail(seg.text.trim(), evidences.join("\n\n")) });
  }
  return out;
}

// --------------------------------------------------------------------------
// Verifier reliability — measure the measurer against human labels.
// --------------------------------------------------------------------------

export type LabeledPair = {
  claim: string;
  evidence: string;
  /** Human gold: does the evidence entail the claim? */
  gold: "supported" | "unsupported";
  note?: string;
};

export type Agreement = {
  n: number;
  accuracy: number;
  /** Cohen's kappa vs. the human labels (chance-corrected agreement). */
  kappa: number;
};

/** Cohen's kappa for two binary label vectors (true = supported). */
export function cohenKappa(gold: boolean[], pred: boolean[]): number {
  const n = gold.length;
  if (n === 0) return 0;
  let agree = 0;
  let goldYes = 0;
  let predYes = 0;
  for (let i = 0; i < n; i += 1) {
    if (gold[i] === pred[i]) agree += 1;
    if (gold[i]) goldYes += 1;
    if (pred[i]) predYes += 1;
  }
  const po = agree / n;
  const pYes = (goldYes / n) * (predYes / n);
  const pNo = (1 - goldYes / n) * (1 - predYes / n);
  const pe = pYes + pNo;
  return pe === 1 ? 1 : (po - pe) / (1 - pe);
}

/** Run the verifier over a labeled slice and report accuracy + kappa. */
export async function measureVerifier(
  pairs: LabeledPair[],
  entail: Entailer,
): Promise<Agreement> {
  const gold: boolean[] = [];
  const pred: boolean[] = [];
  for (const p of pairs) {
    gold.push(p.gold === "supported");
    pred.push(entails(await entail(p.claim, p.evidence)));
  }
  const correct = gold.filter((g, i) => g === pred[i]).length;
  return { n: pairs.length, accuracy: pairs.length ? correct / pairs.length : 0, kappa: cohenKappa(gold, pred) };
}
