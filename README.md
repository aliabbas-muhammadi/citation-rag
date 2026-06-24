# Citation-Grounded RAG

A retrieval-augmented question-answering engine where **every claim is grounded
in a specific source passage**, with inline verifiable citations and an
**abstain path** when the corpus doesn't support an answer. Built for
high-stakes text, where a confident wrong answer is worse than no answer.

The demo corpus is the **U.S. founding documents** — the Constitution, the Bill
of Rights, and a curated set of the Federalist Papers (Project Gutenberg, public
domain) — so every answer is externally checkable.

> Runs end-to-end on the bundled corpus with **no API key** (BM25 retrieval +
> a deterministic offline answer). Add `OPENAI_API_KEY` for dense retrieval and
> `ANTHROPIC_API_KEY` for live, streamed, model-generated cited answers.

## Why this is the hard, interesting version of RAG

Most "chat with your docs" demos stuff chunks into a prompt and hope. This one:

- **Cites with provenance, not vibes.** Uses Anthropic's native citations — each
  source is a `document` block and the model returns text spans tied to a
  specific source with exact character offsets. Citations can't be hallucinated.
  Clicking an inline `[n]` chip opens the retrieved passage with the cited span
  highlighted in context (with a hover preview on desktop).
- **Abstains.** If retrieval doesn't surface enough support, the model returns a
  sentinel and the UI shows "no supported answer" instead of guessing.
- **Streams** the answer token-by-token, attaching citation chips inline as they
  arrive. A repeated question replays from a 24h cache (no re-spend), and a
  grounded answer ends with fail-soft suggested follow-ups.
- **Is measured, not asserted.** An eval harness scores retrieval (recall@k, MRR)
  and answer faithfulness (two independent LLM judges), and gates CI so changes
  are provable.

## Architecture

```
question  (streamed)
   │
   ▼
retrieve(k) ─► hybrid corpus (no DB)
   │            ├─ BM25 lexical rank            (exact terms, names, "Article I, §8")
   │            ├─ dense rank: query embedding (OpenAI text-embedding-3-small) vs.
   │            │              precomputed corpus vectors, cosine
   │            └─ Reciprocal Rank Fusion → top-k
   ▼
streamAnswer ─► Claude (claude-opus-4-8), sources as `document` blocks, citations enabled
   │             → text deltas + citation deltas; abstains with INSUFFICIENT_EVIDENCE
   ▼
/ask UI: answer streams in; [n] chips attach inline; Sources panel; abstain banner
```

Key files: [`lib/rag/`](lib/rag) — `bm25.ts`, `embeddings.ts`, `rrf.ts`,
`corpus.ts` (retrieval), `generate.ts` (streaming + native citations),
`prompt.ts`. The API route [`app/api/ask/route.ts`](app/api/ask/route.ts) streams
NDJSON; the UI is [`app/ask/page.tsx`](app/ask/page.tsx); the eval harness is
[`eval/`](eval); the corpus builders are [`scripts/`](scripts).

## What the evaluation shows

Run `npm run eval`. Measured on 22 in-corpus + 3 out-of-corpus questions, k=5:

| retrieval mode            | recall@5 | MRR   |
| ------------------------- | -------- | ----- |
| lexical (BM25)            | 0.864    | 0.753 |
| dense (embeddings)        | 0.955    | 0.871 |
| hybrid (RRF)              | 0.909    | 0.809 |
| hybrid + source cap (3)   | 0.864    | 0.799 |
| hybrid + query rewrite    | 0.955    | 0.932 |
| hybrid + LLM rerank       | 0.955    | 0.898 |

(LLM rerank/rewrite are non-deterministic; their MRR shifts a little run to run.)

Answer faithfulness is scored by **two independent judges**, both shown the full
cited passages: **Claude = 1.00** (the headline) and **gpt-4o-mini = 0.96**,
combined 0.98. On one clearly-grounded answer gpt-4o-mini returned 0.00 — a
concrete reminder that the cheap judge is the unreliable one, so CI trusts the
Claude judge. **Abstain accuracy = 3/3** on out-of-corpus questions, and the
retrieval-confidence gate cleanly separates answerable (mean top cosine 0.65)
from unanswerable (mean 0.15) queries.

Takeaways (the honest version): hybrid beats lexical, but on this concept-heavy
corpus a strong dense retriever edges out naïve RRF — unweighted fusion can
dilute the better signal. **Reranking** recovers it. **Query rewriting** lifts
recall. The **per-source diversity cap** (`EVAL_SOURCECAP=1`) is the instructive
one: it doubled grounding on the production Shia Library corpus, where one giant
_irrelevant_ book was flooding the top-k — but here it _lowers_ recall (0.91 →
0.86), because the flooding source is usually the _relevant_ Federalist essay.
So it ships measured and off by default. The lesson — and why all of this is
gated in CI — is that retrieval wins are corpus-dependent: measure, don't assume.

## Run it

```bash
npm install
npm run dev            # http://localhost:3000  → "Try the demo" → /ask
npm run eval           # retrieval ablation + recall gate, offline (no key)

# full pipeline + generation experiments:
cp .env.example .env.local        # add OPENAI_API_KEY and ANTHROPIC_API_KEY
EVAL_REWRITE=1 EVAL_RERANK=1 EVAL_FAITHFULNESS=1 npm run eval

# regenerate the corpus / embedding index (output is committed):
npm run build:corpus
OPENAI_API_KEY=sk-... npm run embed
```

## Going to production (the real corpus)

`lib/rag/corpus.ts` keeps a `SupabaseCorpus` stub for the production path:
hybrid retrieval over a Postgres/pgvector corpus (FTS over an
`normalize_arabic()`-indexed column + pgvector dense search, fused with the same
`rrf.ts`, optional cross-encoder rerank). Set `CORPUS_BACKEND=supabase` once
wired. The interface and the eval harness are identical, so the engine ports
unchanged.

## License

Proprietary — see [`LICENSE`](LICENSE). Published for reference; not for reuse.
