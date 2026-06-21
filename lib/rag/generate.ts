import Anthropic from "@anthropic-ai/sdk";
import type { AnswerSegment, Citation, Passage, RagAnswer } from "./types";
import { ABSTAIN_SENTINEL, SYSTEM_PROMPT, buildUserQuestion } from "./prompt";

const MODEL = process.env.GENERATION_MODEL || "claude-opus-4-8";
const MAX_TOKENS = 1500;

/**
 * Generate a grounded, cited answer over the retrieved sources.
 *
 * Uses Anthropic's native citations: each source is a `document` block with
 * citations enabled, so the model returns text blocks carrying verifiable
 * citation spans (cited_text + character offsets) that map back to a source —
 * not prompt-engineered "[1]" markers that can be hallucinated.
 *
 * With no ANTHROPIC_API_KEY set, falls back to a deterministic offline answer
 * so the demo and tests run without credentials.
 */
export async function generateAnswer(
  question: string,
  sources: Passage[],
): Promise<RagAnswer> {
  if (sources.length === 0) {
    return { segments: [], sources, abstained: true, model: "none" };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return mockAnswer(question, sources);
  }

  const client = new Anthropic();

  const documents = sources.map((p) => ({
    type: "document" as const,
    source: { type: "text" as const, media_type: "text/plain" as const, data: p.text },
    title: `${p.book} — ${p.section} ${p.number}`,
    citations: { enabled: true },
  }));

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    // Latency note: thinking is omitted for a snappy user-facing answer.
    // Enable `thinking: { type: "adaptive" }` for harder, multi-hop questions.
    messages: [
      {
        role: "user",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        content: [...documents, { type: "text", text: buildUserQuestion(question) }] as any,
      },
    ],
  });

  const segments: AnswerSegment[] = [];
  let fullText = "";

  for (const block of response.content) {
    if (block.type !== "text") continue;
    fullText += block.text;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawCitations = (block as any).citations as any[] | null | undefined;
    const citations: Citation[] = (rawCitations ?? [])
      .map((c) => {
        const idx = c.document_index as number;
        const passage = sources[idx];
        if (!passage) return null;
        return {
          sourceIndex: idx + 1,
          citedText: c.cited_text as string,
          passageId: passage.id,
        } satisfies Citation;
      })
      .filter((c): c is Citation => c !== null);

    segments.push({ text: block.text, citations });
  }

  const abstained = fullText.trim().startsWith(ABSTAIN_SENTINEL);

  return {
    segments: abstained ? [] : segments,
    sources,
    abstained,
    model: response.model,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}

/** Deterministic, offline answer used when no API key is configured. */
function mockAnswer(question: string, sources: Passage[]): RagAnswer {
  const top = sources.slice(0, 3);
  const segments: AnswerSegment[] = top.map((p, i) => {
    const sentence = firstSentence(p.text);
    return {
      text: (i === 0 ? "" : " ") + sentence,
      citations: [{ sourceIndex: i + 1, citedText: sentence, passageId: p.id }],
    };
  });
  return { segments, sources, abstained: false, model: "mock (no API key)" };
}

function firstSentence(text: string): string {
  const m = text.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : text).trim();
}
