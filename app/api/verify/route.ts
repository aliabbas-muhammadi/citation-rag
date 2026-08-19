import { defaultEntailer } from "@/lib/rag/entail";
import type { EntailmentResult } from "@/lib/rag/verify";

// Node runtime: the Anthropic SDK isn't edge-compatible.
export const runtime = "nodejs";
// Bound wall-clock: this fans out to sequential LLM calls; cap the function so a
// pathological answer can't run unbounded.
export const maxDuration = 60;

// Bound untrusted input: this endpoint fans out to one paid LLM call per *cited*
// statement, so cap the count and the text size per field to cap cost/abuse.
const MAX_STATEMENTS = 25;
const MAX_EVIDENCES = 8;
const MAX_TEXT_LEN = 2000;
const MAX_EVIDENCE_LEN = 3000;
// Rate limit is charged per LLM call (cited statement), not per request, since one
// request can trigger many — so the true cost, not the request count, is bounded.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_CALLS = 30; // verifier calls per IP per window

const hits = new Map<string, { t: number; n: number }[]>();

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  return xff ? xff.split(",")[0]!.trim() : "unknown";
}

/** Token-bucket by LLM-call count over the window. Charges `calls` up front. */
function rateLimited(ip: string, calls: number): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((e) => now - e.t < RATE_WINDOW_MS);
  recent.push({ t: now, n: calls });
  hits.set(ip, recent);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.every((e) => now - e.t >= RATE_WINDOW_MS)) hits.delete(k);
  }
  return recent.reduce((s, e) => s + e.n, 0) > RATE_MAX_CALLS;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type Statement = { text: string; evidences: string[] };

/**
 * Verify citations for one already-generated answer. Each statement is its answer
 * text plus the exact spans cited to support it; we return a per-statement
 * supported/partial/unsupported label (null when the statement had no citation).
 * Runs off the answer's critical path — the UI calls this on demand.
 */
export async function POST(req: Request) {
  let statements: Statement[] = [];
  try {
    const body = (await req.json()) as { statements?: unknown };
    if (Array.isArray(body.statements)) {
      statements = body.statements
        .slice(0, MAX_STATEMENTS)
        .map((s) => s as Statement)
        .map((s) => ({
          text: (typeof s?.text === "string" ? s.text : "").slice(0, MAX_TEXT_LEN),
          evidences: Array.isArray(s?.evidences)
            ? s.evidences
                .filter((e): e is string => typeof e === "string" && e.trim().length > 0)
                .slice(0, MAX_EVIDENCES)
                .map((e) => e.slice(0, MAX_EVIDENCE_LEN))
            : [],
        }));
    }
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  if (statements.length === 0) return json({ error: "statements are required" }, 400);

  // Charge the rate limiter by the number of LLM calls this request will make.
  const calls = statements.filter((s) => s.evidences.length > 0).length;
  if (rateLimited(clientIp(req), Math.max(1, calls))) {
    return json({ error: "Rate limit exceeded — try again in a moment." }, 429);
  }

  const { entail, backend } = defaultEntailer(req.signal);
  const labels: (EntailmentResult | null)[] = [];
  for (const s of statements) {
    // Stop spending on paid calls if the client has already disconnected.
    if (req.signal.aborted) break;
    if (s.evidences.length === 0) {
      labels.push(null);
      continue;
    }
    try {
      labels.push(await entail(s.text.trim(), s.evidences.join("\n\n")));
    } catch {
      labels.push(null);
    }
  }

  return json({ labels, backend }, 200);
}
