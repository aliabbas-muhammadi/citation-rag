import { retrieve } from "@/lib/rag/retrieve";
import { streamAnswer } from "@/lib/rag/generate";

// Node runtime: the corpus + Anthropic SDK aren't edge-compatible.
export const runtime = "nodejs";

const MAX_QUESTION_LEN = 600;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10; // requests per IP per window

// Best-effort, in-memory rate limit. This is a public demo calling paid APIs, so
// it caps casual abuse / cost; it's per-instance (not shared across serverless
// instances) — production would use a shared store (Redis/Upstash), which is the
// same rate-limit + budget-cap concern noted for the real-corpus "Ask" feature.
const hits = new Map<string, number[]>();

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  return xff ? xff.split(",")[0]!.trim() : "unknown";
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= RATE_WINDOW_MS)) hits.delete(k);
  }
  return recent.length > RATE_MAX;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * Streams an answer as newline-delimited JSON (NDJSON). First a `sources` event
 * (so the panel + chip links render immediately), then `block_start` / `text` /
 * `citation` events as the model produces them, then a final `done` event.
 */
export async function POST(req: Request) {
  if (rateLimited(clientIp(req))) {
    return json({ error: "Rate limit exceeded — try again in a moment." }, 429);
  }

  let question = "";
  try {
    const body = (await req.json()) as { question?: unknown };
    if (typeof body.question === "string") question = body.question.trim();
  } catch {
    // fall through to the empty-question check
  }
  if (!question) return json({ error: "question is required" }, 400);
  if (question.length > MAX_QUESTION_LEN) {
    return json({ error: `question too long (max ${MAX_QUESTION_LEN} characters)` }, 400);
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
        // req.signal aborts generation if the client disconnects (saves cost).
        for await (const ev of streamAnswer(question, sources, req.signal)) send(ev);
      } catch (err) {
        if (!(err instanceof Error && err.name === "AbortError")) {
          send({
            type: "error",
            message: err instanceof Error ? err.message : "generation failed",
          });
        }
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
