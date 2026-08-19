/**
 * Entailment verifiers for citation checking. Two independent backends — the same
 * "two judges" design the faithfulness arm uses — so we can report their agreement
 * and never trust a single fallible verifier.
 *
 * These are LLM-backed (they reuse the keys already in play). The research-preferred
 * production verifier is a purpose-built NLI model (e.g. MiniCheck-FT5, 770M,
 * ~GPT-4 accuracy at ~400x lower cost): implement the same `Entailer` interface with
 * a small Python sidecar and it drops in unchanged. Whatever the backend, its own
 * reliability is measured against the human-labeled slice (see `measureVerifier`).
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { Entailer, EntailmentLabel, EntailmentResult } from "@/lib/rag/verify";

const SYSTEM =
  "You are a strict natural-language-inference verifier for a citation checker. " +
  "Given EVIDENCE and a CLAIM, decide whether the EVIDENCE ALONE entails the CLAIM — " +
  "i.e. the claim's factual content is fully supported by, and inferable from, the " +
  "evidence, using no outside knowledge. Judge only support, not style. Watch for " +
  "archaic 18th-century phrasing. Reply ONLY with JSON: " +
  '{"label": "supported" | "partial" | "unsupported", "score": <0..1 confidence of full support>}. ' +
  'Use "partial" when only part of the claim is supported.';

const userMsg = (claim: string, evidence: string) => `EVIDENCE:\n${evidence}\n\nCLAIM:\n${claim}`;

const LABELS: EntailmentLabel[] = ["supported", "partial", "unsupported"];

/** Parse a verifier's JSON-ish reply; default to unsupported on any failure. */
export function parseEntailment(raw: string): EntailmentResult {
  try {
    const obj = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    const label: EntailmentLabel = LABELS.includes(obj.label) ? obj.label : "unsupported";
    const score =
      typeof obj.score === "number" ? Math.max(0, Math.min(1, obj.score)) : label === "supported" ? 1 : 0;
    return { label, score };
  } catch {
    return { label: "unsupported", score: 0 };
  }
}

/** Claude entailment verifier (headline). Needs ANTHROPIC_API_KEY (client passed in). */
export function claudeEntailer(client: Anthropic, model: string): Entailer {
  return async (claim, evidence) => {
    const res = await client.messages.create({
      model,
      max_tokens: 200,
      system: SYSTEM,
      messages: [{ role: "user", content: userMsg(claim, evidence) }],
    });
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return parseEntailment(text);
  };
}

/** OpenAI entailment verifier (secondary). Reports unsupported (never throws) if no key / on error. */
export function openaiEntailer(model: string): Entailer {
  return async (claim, evidence) => {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return { label: "unsupported", score: 0 };
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: 200,
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: userMsg(claim, evidence) },
          ],
        }),
      });
      if (!res.ok) {
        console.error(`openai entailer: ${res.status}`);
        return { label: "unsupported", score: 0 };
      }
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return parseEntailment(data.choices?.[0]?.message?.content ?? "");
    } catch (err) {
      console.error("openai entailer failed:", err);
      return { label: "unsupported", score: 0 };
    }
  };
}
