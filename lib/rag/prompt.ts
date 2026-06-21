/** The sentinel the model returns when the sources don't support an answer. */
export const ABSTAIN_SENTINEL = "INSUFFICIENT_EVIDENCE";

/**
 * System prompt for grounded, citation-faithful answering.
 * Sources are supplied as separate `document` content blocks (with the
 * Anthropic citations feature enabled), not inlined here — so the model's
 * citations map back to verifiable spans automatically.
 */
export const SYSTEM_PROMPT = `You answer questions strictly from the provided source documents.

Rules:
- Use ONLY the information in the source documents. Do not use any outside knowledge.
- Ground every factual sentence in the sources using the citation feature.
- Be concise and precise. Prefer the wording of the sources over paraphrase when it matters.
- If the sources do not contain enough information to answer the question, reply with exactly "${ABSTAIN_SENTINEL}" and nothing else. Do not guess, and do not apologize.`;

export function buildUserQuestion(question: string): string {
  return `Question: ${question.trim()}\n\nAnswer using only the source documents above. Cite the sources for every claim.`;
}
