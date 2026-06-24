import Anthropic from "@anthropic-ai/sdk";
import type { Passage } from "./types";

// A small, cheap model — suggestions are sugar, not the answer.
const SUGGEST_MODEL = process.env.SUGGEST_MODEL || "claude-haiku-4-5-20251001";

/**
 * Fail-soft follow-up suggestions, generated AFTER the answer has fully
 * streamed (off the critical path). Returns [] on any error or with no API key
 * — UX sugar must never break, slow, or fail the answer itself.
 */
export async function suggestFollowups(
  question: string,
  sources: Passage[],
): Promise<string[]> {
  if (!process.env.ANTHROPIC_API_KEY || sources.length === 0) return [];
  try {
    const client = new Anthropic();
    const context = sources
      .slice(0, 5)
      .map((p, i) => `[${i + 1}] ${p.book} — ${p.section}: ${p.text.slice(0, 200)}`)
      .join("\n");
    const res = await client.messages.create({
      model: SUGGEST_MODEL,
      max_tokens: 200,
      system:
        "Given a question and the source passages used to answer it, propose 2-3 short, specific " +
        "follow-up questions that the SAME corpus (the U.S. founding documents — the Constitution, " +
        "the Bill of Rights, and the Federalist Papers) can answer. Output ONLY a JSON array of " +
        "strings, no prose.",
      messages: [{ role: "user", content: `QUESTION: ${question}\n\nSOURCES:\n${context}` }],
    });
    const raw = res.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    const arr = JSON.parse(raw.slice(raw.indexOf("["), raw.lastIndexOf("]") + 1));
    return Array.isArray(arr)
      ? arr.filter((s): s is string => typeof s === "string" && s.trim().length > 0).slice(0, 3)
      : [];
  } catch {
    return [];
  }
}
