"use client";

import { useRef, useState } from "react";
import type { Citation, Passage } from "@/lib/rag";

type Segment = { text: string; citations: Citation[] };
type Meta = { model?: string; usage?: { inputTokens: number; outputTokens: number } };

const EXAMPLES = [
  "What does the First Amendment protect?",
  "How can the Constitution be amended?",
  "Why did Madison think factions are dangerous?",
  "What did Hamilton argue about judicial review?",
  "What is the capital of Australia?", // out-of-corpus → should abstain
];

export default function AskPage() {
  const [question, setQuestion] = useState("");
  const [sources, setSources] = useState<Passage[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [status, setStatus] = useState<"idle" | "streaming" | "done">("idle");
  const [abstained, setAbstained] = useState(false);
  const [meta, setMeta] = useState<Meta>({});
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  async function run(q: string) {
    const query = q.trim();
    if (!query || busy.current) return;
    busy.current = true;

    setStatus("streaming");
    setError(null);
    setSources([]);
    setSegments([]);
    setAbstained(false);
    setMeta({});

    const segs: Segment[] = [];
    const flush = () =>
      setSegments(segs.map((s) => ({ text: s.text, citations: [...s.citations] })));
    const last = () => {
      if (segs.length === 0) segs.push({ text: "", citations: [] });
      return segs[segs.length - 1];
    };

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: query }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "request failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line);
          switch (ev.type) {
            case "sources":
              setSources(ev.sources);
              break;
            case "block_start":
              segs.push({ text: "", citations: [] });
              flush();
              break;
            case "text":
              last().text += ev.text;
              flush();
              break;
            case "citation":
              last().citations.push(ev.citation);
              flush();
              break;
            case "done":
              setAbstained(ev.abstained);
              setMeta({ model: ev.model, usage: ev.usage });
              break;
            case "error":
              throw new Error(ev.message);
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "something went wrong");
    } finally {
      setStatus("done");
      busy.current = false;
    }
  }

  const streaming = status === "streaming";
  const hasAnswer = segments.some((s) => s.text.trim().length > 0);

  return (
    <main className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Ask the corpus</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Citation-grounded answers over the U.S. founding documents — the
        Constitution, the Bill of Rights, and the Federalist Papers. Every claim
        links to the exact passage that supports it, and when the sources
        don&apos;t contain the answer, it says so instead of guessing.
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
            disabled={streaming}
            className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
          >
            {streaming ? "Thinking…" : "Ask"}
          </button>
          <span className="text-xs text-zinc-500">
            Hybrid retrieval (BM25 + embeddings) · streamed, grounded answer
          </span>
        </div>
      </form>

      <div className="mt-4 flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            disabled={streaming}
            onClick={() => {
              setQuestion(ex);
              run(ex);
            }}
            className="rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-600 hover:border-zinc-500 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400"
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

      {(streaming || status === "done") && !error && (
        <section className="mt-8">
          {abstained ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              No supported answer found in the available sources. (The engine
              abstains rather than guess.)
            </div>
          ) : (
            (hasAnswer || streaming) && (
              <div className="rounded-xl border border-zinc-200 bg-white p-5 text-[0.95rem] leading-relaxed dark:border-zinc-800 dark:bg-zinc-900">
                <p>
                  {segments.map((seg, i) => (
                    <span key={i}>
                      {seg.text}
                      {seg.citations.map((c, j) => (
                        <a
                          key={`${i}-${j}`}
                          href={`#source-${c.sourceIndex}`}
                          title={c.citedText}
                          className="mx-0.5 inline-flex translate-y-[-2px] items-center rounded bg-zinc-200 px-1 text-[0.65rem] font-medium text-zinc-700 no-underline dark:bg-zinc-700 dark:text-zinc-200"
                        >
                          {c.sourceIndex}
                        </a>
                      ))}
                    </span>
                  ))}
                  {streaming && (
                    <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-zinc-400 align-middle" />
                  )}
                </p>
              </div>
            )
          )}

          {sources.length > 0 && (
            <>
              <h2 className="mt-8 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Sources
              </h2>
              <ol className="mt-3 space-y-3">
                {sources.map((p, i) => (
                  <li
                    key={p.id}
                    id={`source-${i + 1}`}
                    className="scroll-mt-20 rounded-lg border border-zinc-200 p-4 text-sm target:border-zinc-500 dark:border-zinc-800"
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
            </>
          )}

          {meta.model && (
            <p className="mt-6 text-xs text-zinc-400">
              Model: {meta.model}
              {meta.usage
                ? ` · ${meta.usage.inputTokens} in / ${meta.usage.outputTokens} out tokens`
                : ""}
            </p>
          )}
        </section>
      )}
    </main>
  );
}
