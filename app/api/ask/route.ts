import { NextResponse } from "next/server";
import { ask } from "@/lib/rag";

// Node runtime: the corpus + Anthropic SDK aren't edge-compatible.
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const question = (body as { question?: unknown }).question;
    if (typeof question !== "string" || question.trim().length === 0) {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }
    const answer = await ask(question, 5);
    return NextResponse.json(answer);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "internal error" },
      { status: 500 },
    );
  }
}
