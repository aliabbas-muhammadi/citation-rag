import { defaultEntailer } from "@/lib/rag/entail";
import type { EntailmentResult } from "@/lib/rag/verify";

// Node runtime: the Anthropic SDK isn't edge-compatible.
export const runtime = "nodejs";

const MAX_STATEMENTS = 40;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10; // requests per IP per window

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
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type Statement = { text: string; evidences: string[] };

/**
 * Verify citations for one already-generated answer. Each statement is its answer
 * text plus the exact spans cited to support it; we return a per-statement
 * supported/partial/unsupported label (null when the statement had no citation).
 * Runs off the answer's critical path — the UI calls this on demand.
 */
export async function POST(req: Request) {
  if (rateLimited(clientIp(req))) {
    return json({ error: "Rate limit exceeded — try again in a moment." }, 429);
  }

  let statements: Statement[] = [];
  try {
    const body = (await req.json()) as { statements?: unknown };
    if (Array.isArray(body.statements)) {
      statements = body.statements
        .slice(0, MAX_STATEMENTS)
        .map((s) => s as Statement)
        .map((s) => ({
          text: typeof s?.text === "string" ? s.text : "",
          evidences: Array.isArray(s?.evidences)
            ? s.evidences.filter((e): e is string => typeof e === "string" && e.trim().length > 0)
            : [],
        }));
    }
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  if (statements.length === 0) return json({ error: "statements are required" }, 400);

  const { entail, backend } = defaultEntailer();
  const labels: (EntailmentResult | null)[] = [];
  for (const s of statements) {
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
