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
        Designed for high-stakes text where a confident wrong answer is worse
        than no answer.
      </p>
      <ul className="mt-6 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
        <li>· Hybrid retrieval over a pluggable corpus (mock or Postgres/pgvector)</li>
        <li>· Native, verifiable citations (cited span + source, not made-up [1]s)</li>
        <li>· Abstains instead of guessing when evidence is missing</li>
        <li>· An eval harness: recall@k + answer-faithfulness scoring</li>
      </ul>
      <div className="mt-8">
        <Link
          href="/ask"
          className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
        >
          Try the demo →
        </Link>
      </div>
      <p className="mt-6 text-xs text-zinc-400">
        Runs offline on a sample corpus with no API key. Add an{" "}
        <code>ANTHROPIC_API_KEY</code> for live, model-generated cited answers.
      </p>
    </main>
  );
}
