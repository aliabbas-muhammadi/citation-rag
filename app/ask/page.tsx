"use client";

import { useState } from "react";
import type { RagAnswer } from "@/lib/rag";

const EXAMPLES = [
  "Why is the ocean salty?",
  "How does rain form?",
  "What is an aquifer?",
  "Who was the first person on the Moon?", // out-of-corpus → should abstain
];

export default function AskPage() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<RagAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(q: string) {
    const query = q.trim();
    if (!query) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: query }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "request failed");
      setAnswer(data as RagAnswer);
    } catch (e) {
      setError(e instanceof Error ? e.message : "something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Ask the library</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Citation-grounded answers over a sample corpus. Every claim links to the
        exact source passage that supports it — and when the sources don&apos;t
        contain the answer, it says so instead of guessing.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(question);
        }}
        className="mt-6"
      >
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          placeholder="Ask a question…"
          className="w-full resize-none rounded-xl border border-zinc-300 bg-white p-3 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
          >
            {loading ? "Thinking…" : "Ask"}
          </button>
          <span className="text-xs text-zinc-500">Top-5 retrieval · grounded answer</span>
        </div>
      </form>

      <div className="mt-4 flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => {
              setQuestion(ex);
              run(ex);
            }}
            className="rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-600 hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
          >
            {ex}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {answer && (
        <section className="mt-8">
          {answer.abstained ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              No supported answer found in the available sources. (The engine
              abstains rather than guess.)
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-200 bg-white p-5 text-[0.95rem] leading-relaxed dark:border-zinc-800 dark:bg-zinc-900">
              <p>
                {answer.segments.map((seg, i) => (
                  <span key={i}>
                    {seg.text}
                    {seg.citations.map((c) => (
                      <a
                        key={`${i}-${c.sourceIndex}`}
                        href={`#source-${c.sourceIndex}`}
                        title={c.citedText}
                        className="mx-0.5 inline-flex translate-y-[-2px] items-center rounded bg-zinc-200 px-1 text-[0.65rem] font-medium text-zinc-700 no-underline dark:bg-zinc-700 dark:text-zinc-200"
                      >
                        {c.sourceIndex}
                      </a>
                    ))}
                  </span>
                ))}
              </p>
            </div>
          )}

          {/* Sources */}
          <h2 className="mt-8 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Sources
          </h2>
          <ol className="mt-3 space-y-3">
            {answer.sources.map((p, i) => (
              <li
                key={p.id}
                id={`source-${i + 1}`}
                className="rounded-lg border border-zinc-200 p-4 text-sm target:border-zinc-500 dark:border-zinc-800"
              >
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-xs text-zinc-400">[{i + 1}]</span>
                  <span className="font-medium">
                    {p.book} — {p.section} {p.number}
                  </span>
                </div>
                <p className="mt-1 text-zinc-600 dark:text-zinc-400">{p.text}</p>
              </li>
            ))}
          </ol>

          <p className="mt-6 text-xs text-zinc-400">
            Model: {answer.model}
            {answer.usage
              ? ` · ${answer.usage.inputTokens} in / ${answer.usage.outputTokens} out tokens`
              : ""}
          </p>
        </section>
      )}
    </main>
  );
}
