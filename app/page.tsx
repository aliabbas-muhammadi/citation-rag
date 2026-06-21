import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-5 py-16">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-500">
        Citation-grounded RAG
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
        Answers you can verify, line by line.
      </h1>
      <p className="mt-4 text-zinc-600 dark:text-zinc-400">
        A retrieval-augmented question-answering engine where every claim is
        grounded in a specific source passage — with inline, checkable citations
        and an abstain path when the corpus doesn&apos;t support an answer.
        Built for high-stakes text, where a confident wrong answer is worse than
        no answer.
      </p>
      <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-500">
        The demo corpus is the U.S. founding documents — the Constitution, the
        Bill of Rights, and the Federalist Papers (public domain) — so every
        answer is externally checkable.
      </p>
      <ul className="mt-6 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
        <li>· Hybrid retrieval: BM25 + dense embeddings, fused with Reciprocal Rank Fusion</li>
        <li>· Native, verifiable citations (cited span + source, not made-up [1]s)</li>
        <li>· Streams the answer and abstains instead of guessing when evidence is missing</li>
        <li>· An eval harness scores retrieval (recall@k, MRR) and answer faithfulness</li>
      </ul>
      <div className="mt-8 flex items-center gap-3">
        <Link
          href="/ask"
          className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
        >
          Try the demo →
        </Link>
        <a
          href="https://github.com/aliabbas-muhammadi/citation-rag"
          className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-700 hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-300"
        >
          Source &amp; eval
        </a>
      </div>
      <p className="mt-6 text-xs text-zinc-400">
        Runs offline on the bundled corpus with no API key. Add an{" "}
        <code>ANTHROPIC_API_KEY</code> (answers) and <code>OPENAI_API_KEY</code>{" "}
        (dense retrieval) for the full hybrid pipeline.
      </p>
    </main>
  );
}
