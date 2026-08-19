/**
 * Entailment verifiers for citation checking — used by both the eval harness and
 * the runtime "verify citations" endpoint. Two LLM backends (the "two judges"
 * design) plus a deterministic offline stand-in so the feature works keyless,
 * exactly like the offline answer path.
 *
 * The research-preferred production verifier is a purpose-built NLI model (e.g.
 * MiniCheck-FT5, 770M, ~GPT-4 accuracy at ~400x lower cost): implement the same
 * `Entailer` interface with a small Python sidecar and it drops in unchanged.
 * Whatever the backend, its reliability is measured against a human-labeled slice
 * (see `measureVerifier` in ./verify).
 */
import Anthropic from "@anthropic-ai/sdk";
import type { Entailer, EntailmentLabel, EntailmentResult } from "./verify";

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

const STOP = new Set([
  "that", "this", "with", "from", "have", "shall", "which", "their", "there",
  "these", "those", "been", "were", "will", "would", "such", "into", "upon", "each",
]);

const contentWords = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w));

/**
 * Deterministic offline verifier — token overlap between claim and evidence. A
 * lexical stand-in (NOT real entailment) for the keyless demo, mirroring the
 * offline answer path; the LLM/NLI verifier is used whenever a key is present.
 */
export const offlineEntailer: Entailer = async (claim, evidence) => {
  const claimWords = contentWords(claim);
  if (claimWords.length === 0) return { label: "unsupported", score: 0 };
  const ev = new Set(contentWords(evidence));
  const overlap = claimWords.filter((w) => ev.has(w)).length / claimWords.length;
  const label: EntailmentLabel = overlap >= 0.6 ? "supported" : overlap >= 0.3 ? "partial" : "unsupported";
  return { label, score: Number(overlap.toFixed(2)) };
};

/** Pick the best available verifier: Claude if keyed, else the offline stand-in. */
export function defaultEntailer(): { entail: Entailer; backend: string } {
  if (process.env.ANTHROPIC_API_KEY) {
    const client = new Anthropic();
    const model = process.env.VERIFY_MODEL || "claude-opus-4-8";
    return { entail: claudeEntailer(client, model), backend: `claude:${model}` };
  }
  return { entail: offlineEntailer, backend: "offline (lexical stand-in — no API key)" };
}
