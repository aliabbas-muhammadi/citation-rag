import { retrieve } from "@/lib/rag/retrieve";
import { streamAnswer } from "@/lib/rag/generate";

// Node runtime: the corpus + Anthropic SDK aren't edge-compatible.
export const runtime = "nodejs";

/**
 * Streams an answer as newline-delimited JSON (NDJSON). First a `sources` event
 * (so the panel + chip links render immediately), then `block_start` / `text` /
 * `citation` events as the model produces them, then a final `done` event.
 */
export async function POST(req: Request) {
  let question = "";
  try {
    const body = (await req.json()) as { question?: unknown };
    if (typeof body.question === "string") question = body.question.trim();
  } catch {
    // fall through to the empty-question check
  }
  if (!question) {
    return new Response(JSON.stringify({ error: "question is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const chunks = await retrieve(question, 5);
  const sources = chunks.map((c) => c.passage);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        send({ type: "sources", sources });
        for await (const ev of streamAnswer(question, sources)) send(ev);
      } catch (err) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : "generation failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
