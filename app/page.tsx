import Link from "next/link";
import { FootnoteSpecimen } from "@/components/FootnoteSpecimen";
import { Reveal } from "@/components/ui/Reveal";
import { RevealOnScroll } from "@/components/ui/RevealOnScroll";
import { DiagramFrame, Node, Pipeline, FlowArrow } from "@/components/diagrams/parts";

// Honest, CI-gated figures — hybrid RRF is the shipped default; the higher
// recall@5 0.955 row is the non-deterministic query-rewrite ablation (README).
const COLOPHON = [
  { value: "1.00", label: "faithfulness · Claude judge" },
  { value: "3/3", label: "abstain · out-of-corpus" },
  { value: "0.909", label: "recall@5 · hybrid RRF" },
  { value: "0.809", label: "MRR · hybrid RRF" },
];

const PRINCIPLES = [
  {
    title: "Hybrid retrieval",
    body: "BM25 lexical and dense embeddings, fused with Reciprocal Rank Fusion — exact terms, names, and §-numbers from one; paraphrase and concept matches from the other. Neither half alone is enough.",
  },
  {
    title: "Native, verifiable citations",
    body: "Sources go to Claude as document blocks with citations enabled, so every cited span is a real substring of a real passage — not a model-invented [1]. Open any marker to read it in context.",
  },
  {
    title: "Abstains, doesn't guess",
    body: "When retrieval surfaces no supporting evidence, the engine declines instead of fabricating. An out-of-corpus question is met with silence, not confidence — measured at 3/3 abstain accuracy.",
  },
];

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-line">
        <div
          aria-hidden
          className="blueprint blueprint--alive pointer-events-none absolute inset-0 opacity-70"
        />
        <div className="relative mx-auto max-w-5xl px-5 pb-14 pt-16 sm:px-8 sm:pb-16 sm:pt-24">
          <div className="grid gap-10 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-14">
            <div>
              <Reveal>
                <p className="eyebrow flex items-center gap-2">
                  <span className="verdigris--dot inline-block h-1.5 w-1.5">
                    <span className="block h-full w-full rounded-full bg-accent" />
                  </span>
                  Citation-grounded RAG
                </p>
              </Reveal>
              <Reveal delay={0.05}>
                <h1 className="mt-6 max-w-2xl text-display font-serif text-ink">
                  Answers you can verify, line by line.
                </h1>
              </Reveal>
              <Reveal delay={0.1}>
                <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-muted">
                  A retrieval-augmented answer engine where every claim is grounded in a
                  specific source passage — with inline, checkable citations and an
                  abstain path when the corpus doesn&apos;t support an answer. Built for
                  high-stakes text, where a confident wrong answer is worse than no
                  answer.
                </p>
              </Reveal>
              <Reveal delay={0.15}>
                <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
                  <Link
                    href="/ask"
                    className="group inline-flex items-center gap-1.5 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-on-accent transition-colors hover:bg-accent-strong"
                  >
                    Try the demo
                    <span aria-hidden className="arrow-nudge">
                      →
                    </span>
                  </Link>
                  <a
                    href="https://github.com/aliabbas-muhammadi/citation-rag"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-ink transition-colors hover:text-accent"
                  >
                    Source &amp; eval
                    <span aria-hidden>↗</span>
                  </a>
                </div>
              </Reveal>
              <Reveal delay={0.2}>
                <p className="mt-6 max-w-xl text-sm leading-relaxed text-ink-faint">
                  The demo corpus is the U.S. founding documents — the Constitution, the
                  Bill of Rights, and the Federalist Papers (public domain) — so every
                  answer is externally checkable.
                </p>
              </Reveal>
            </div>

            <Reveal delay={0.15}>
              <FootnoteSpecimen />
            </Reveal>
          </div>
        </div>

        {/* Colophon — honest, labeled eval figures */}
        <div className="relative mx-auto max-w-5xl px-5 sm:px-8">
          <Reveal delay={0.25}>
            <dl className="grid grid-cols-2 divide-line border-y border-line sm:grid-cols-4 sm:divide-x">
              {COLOPHON.map((m, i) => (
                <div
                  key={m.label}
                  className={"px-1 py-5 sm:px-6" + (i < 2 ? " border-b border-line sm:border-b-0" : "")}
                >
                  <dt className="font-serif text-2xl text-ink sm:text-3xl">{m.value}</dt>
                  <dd className="mt-1 font-mono text-[0.66rem] uppercase tracking-[0.1em] text-ink-faint">
                    {m.label}
                  </dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </section>

      {/* Principles + architecture */}
      <section className="mx-auto max-w-5xl px-5 py-16 sm:px-8 sm:py-20">
        <RevealOnScroll>
          <p className="eyebrow">How it works</p>
          <h2 className="mt-2 max-w-3xl font-serif text-2xl text-ink sm:text-3xl">
            Two readings, fused — then grounded, or withheld.
          </h2>
          <p className="mt-3 max-w-2xl text-ink-muted">
            Retrieval finds the passages; generation is constrained to cite them. The
            whole path is scored by an eval harness that gates CI on retrieval recall and
            answer faithfulness.
          </p>
        </RevealOnScroll>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_1.1fr] lg:items-start lg:gap-12">
          <div className="space-y-7">
            {PRINCIPLES.map((p, i) => (
              <RevealOnScroll key={p.title}>
                <div className="border-l-2 border-accent/30 pl-5">
                  <h3 className="flex items-baseline gap-2 font-serif text-xl text-ink">
                    <span className="font-mono text-[0.7rem] text-ink-faint">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {p.title}
                  </h3>
                  <p className="mt-2 leading-relaxed text-ink-muted">{p.body}</p>
                </div>
              </RevealOnScroll>
            ))}
          </div>

          <RevealOnScroll>
            <DiagramFrame
              label="Citation-Grounded RAG — query & answer flow"
              caption="Lexical and dense retrieval are fused with Reciprocal Rank Fusion; sources go to Claude as document blocks with citations enabled, so every answer span links to a verifiable source — or the engine abstains."
            >
              <div className="space-y-4">
                <Node title="Question" sub="streamed end-to-end" />
                <FlowArrow />
                <div className="rounded-xl border border-line bg-paper-raised p-4">
                  <p className="eyebrow mb-3">Hybrid retrieval</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Node title="BM25 lexical" sub="exact terms · names · §-numbers" />
                    <Node title="Dense embeddings" sub="paraphrase · concepts" accent />
                  </div>
                  <div className="mt-3">
                    <FlowArrow />
                    <Node title="Reciprocal Rank Fusion" sub="→ top-k (+ optional rerank)" accent />
                  </div>
                </div>
                <FlowArrow />
                <Node
                  title="Claude · document blocks, citations enabled"
                  sub="native cited spans, not made-up [1]s"
                  accent
                />
                <FlowArrow />
                <Pipeline
                  stages={[
                    { title: "Streamed cited answer", sub: "[n] chips open the source" },
                    { title: "or Abstain", sub: "no supported evidence", accent: true },
                  ]}
                />
              </div>
            </DiagramFrame>
          </RevealOnScroll>
        </div>

        <RevealOnScroll>
          <div className="mt-16 flex flex-col items-start gap-4 rounded-2xl border border-line bg-paper-sunken/40 p-8 sm:flex-row sm:items-center sm:justify-between sm:p-10">
            <div>
              <h2 className="font-serif text-2xl text-ink">Ask it something checkable.</h2>
              <p className="mt-2 max-w-xl text-ink-muted">
                Query the founding documents and watch every claim attach to the exact
                passage that supports it — or watch it decline when the sources don&apos;t.
              </p>
            </div>
            <Link
              href="/ask"
              className="group inline-flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-on-accent transition-colors hover:bg-accent-strong"
            >
              Ask the corpus
              <span aria-hidden className="arrow-nudge">
                →
              </span>
            </Link>
          </div>
        </RevealOnScroll>
      </section>
    </>
  );
}
