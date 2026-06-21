import Anthropic from "@anthropic-ai/sdk";
import type { AnswerSegment, Citation, Passage, RagAnswer } from "./types";
import { ABSTAIN_SENTINEL, SYSTEM_PROMPT, buildUserQuestion } from "./prompt";

const MODEL = process.env.GENERATION_MODEL || "claude-opus-4-8";
const MAX_TOKENS = 1500;

/**
 * Each source is a `document` block with citations enabled, so the model returns
 * verifiable citation spans (cited_text + char offsets) tied to a specific
 * source — not prompt-engineered "[1]" markers that can be hallucinated.
 */
function buildDocuments(sources: Passage[]): Anthropic.DocumentBlockParam[] {
  return sources.map((p) => ({
    type: "document",
    source: { type: "text", media_type: "text/plain", data: p.text },
    title: `${p.book} — ${p.section} ${p.number}`.trim(),
    citations: { enabled: true },
  }));
}

function buildContent(question: string, sources: Passage[]): Anthropic.ContentBlockParam[] {
  return [...buildDocuments(sources), { type: "text", text: buildUserQuestion(question) }];
}

/** Map a raw char-location citation to our verifiable Citation, 1-based. */
function mapCitation(
  raw: { document_index?: number; cited_text?: string },
  sources: Passage[],
): Citation | null {
  const idx = raw.document_index;
  if (idx == null) return null;
  const passage = sources[idx];
  if (!passage) return null;
  return { sourceIndex: idx + 1, citedText: raw.cited_text ?? "", passageId: passage.id };
}

// --------------------------------------------------------------------------
// Streaming generation — incremental text + citations for the live UI.
// --------------------------------------------------------------------------

export type StreamEvent =
  | { type: "block_start" }
  | { type: "text"; text: string }
  | { type: "citation"; citation: Citation }
  | {
      type: "done";
      abstained: boolean;
      model: string;
      usage?: { inputTokens: number; outputTokens: number };
    };

/**
 * Stream a grounded answer as a sequence of events. Each Anthropic content
 * block becomes a "segment" (block_start → text… → citation…), so the UI can
 * place citation chips inline, right after the span they support.
 *
 * Abstention is suppressed cleanly: leading text is buffered just long enough
 * to tell whether the model emitted the INSUFFICIENT_EVIDENCE sentinel; if so,
 * nothing is streamed and `done.abstained` is true. With no ANTHROPIC_API_KEY,
 * falls back to a deterministic offline stream.
 */
export async function* streamAnswer(
  question: string,
  sources: Passage[],
): AsyncGenerator<StreamEvent> {
  if (sources.length === 0) {
    yield { type: "done", abstained: true, model: "none" };
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    yield* streamMock(sources);
    return;
  }

  const client = new Anthropic();
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    // Latency note: thinking is omitted for a snappy first token. Enable
    // `thinking: { type: "adaptive" }` for harder, multi-hop questions.
    messages: [{ role: "user", content: buildContent(question, sources) }],
  });

  let fullText = "";
  let gateOpen = false; // becomes true once we know it isn't an abstain
  let abstained = false;
  let pending = ""; // buffered leading text, held until the gate decision

  // Decide whether the answer is an abstain as soon as we have enough leading
  // text (or the first block ends). Returns events to emit when the gate opens.
  function tryGate(blockEnded = false): StreamEvent[] {
    if (gateOpen || abstained) return [];
    const lead = fullText.replace(/^\s+/, "");
    if (lead.length < ABSTAIN_SENTINEL.length && !blockEnded) return [];
    if (lead.startsWith(ABSTAIN_SENTINEL)) {
      abstained = true;
      pending = "";
      return [];
    }
    gateOpen = true;
    const events: StreamEvent[] = [{ type: "block_start" }];
    if (pending) events.push({ type: "text", text: pending });
    pending = "";
    return events;
  }

  for await (const event of stream) {
    if (event.type === "content_block_start" && event.content_block.type === "text") {
      // First block's start is emitted by tryGate when the gate opens.
      if (gateOpen) yield { type: "block_start" };
    } else if (event.type === "content_block_delta") {
      const d = event.delta;
      if (d.type === "text_delta") {
        fullText += d.text;
        if (gateOpen) {
          yield { type: "text", text: d.text };
        } else if (!abstained) {
          pending += d.text;
          for (const e of tryGate()) yield e;
        }
      } else if (d.type === "citations_delta" && d.citation.type === "char_location") {
        if (!gateOpen && !abstained) for (const e of tryGate()) yield e;
        if (gateOpen) {
          const c = mapCitation(d.citation, sources);
          if (c) yield { type: "citation", citation: c };
        }
      }
    }
  }
  // Flush in case a very short answer never reached the sentinel length.
  for (const e of tryGate(true)) yield e;

  const final = await stream.finalMessage();
  yield {
    type: "done",
    abstained,
    model: final.model,
    usage: { inputTokens: final.usage.input_tokens, outputTokens: final.usage.output_tokens },
  };
}

/** Deterministic, offline stream used when no API key is configured. */
async function* streamMock(sources: Passage[]): AsyncGenerator<StreamEvent> {
  const top = sources.slice(0, 3);
  for (let i = 0; i < top.length; i++) {
    const p = top[i];
    const sentence = firstSentence(p.text);
    yield { type: "block_start" };
    yield { type: "text", text: (i === 0 ? "" : " ") + sentence };
    yield { type: "citation", citation: { sourceIndex: i + 1, citedText: sentence, passageId: p.id } };
  }
  yield { type: "done", abstained: false, model: "mock (no API key)" };
}

// --------------------------------------------------------------------------
// Non-streaming generation — used by the eval harness.
// --------------------------------------------------------------------------

export async function generateAnswer(
  question: string,
  sources: Passage[],
): Promise<RagAnswer> {
  if (sources.length === 0) {
    return { segments: [], sources, abstained: true, model: "none" };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return mockAnswer(sources);
  }

  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildContent(question, sources) }],
  });

  const segments: AnswerSegment[] = [];
  let fullText = "";

  for (const block of response.content) {
    if (block.type !== "text") continue;
    fullText += block.text;
    const citations: Citation[] = (block.citations ?? [])
      .map((c) => (c.type === "char_location" ? mapCitation(c, sources) : null))
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
function mockAnswer(sources: Passage[]): RagAnswer {
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
