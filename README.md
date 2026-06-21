# Citation-Grounded RAG

A retrieval-augmented question-answering engine where **every claim is grounded
in a specific source passage**, with inline verifiable citations and an
**abstain path** when the corpus doesn't support an answer. Built for
high-stakes text, where a confident wrong answer is worse than no answer.

> Status: scaffold. Runs end-to-end on a bundled sample corpus with **no API key
> and no database**. Add an `ANTHROPIC_API_KEY` for live, model-generated cited
> answers; point it at a real Postgres/pgvector corpus to go to production.

## Why this is the hard, interesting version of RAG

Most "chat with your docs" demos stuff chunks into a prompt and hope. This one:

- **Cites with provenance, not vibes.** Uses Anthropic's native citations — each
  source is a `document` block, and the model returns text spans tied to a
  specific source with exact character offsets. Citations can't be hallucinated.
- **Abstains.** If retrieval doesn't surface enough support, the model returns a
  sentinel and the UI shows "no supported answer" instead of guessing.
- **Is measured, not asserted.** An eval harness scores retrieval (recall@k, MRR)
  and answer faithfulness (LLM judge) so changes are provable.

## Architecture

```
question
   |
   v
retrieve(k)  --->  Corpus (pluggable)
   |               |- MockCorpus      TF-IDF + Arabic-aware normalization (offline)
   |               |- SupabaseCorpus  hybrid: FTS + pgvector + RRF (+ rerank)  [stub]
   v
generateAnswer --> Claude, sources as `document` blocks w/ citations enabled
   |                -> answer split into segments, each carrying verifiable citations
   |                -> abstains with INSUFFICIENT_EVIDENCE when unsupported
   v
RagAnswer { segments[], sources[], abstained, usage }  --->  /ask UI
```

Key files: [`lib/rag/`](lib/rag) (`corpus.ts`, `retrieve.ts`, `prompt.ts`,
`generate.ts`, `index.ts`), the API route [`app/api/ask/route.ts`](app/api/ask/route.ts),
the UI [`app/ask/page.tsx`](app/ask/page.tsx), and the eval harness
[`eval/`](eval).

## Run it

```bash
npm install
npm run dev          # http://localhost:3000  -> "Try the demo" -> /ask
npm run eval         # retrieval metrics, offline (no key needed)

# live answers + faithfulness scoring:
cp .env.example .env.local   # add ANTHROPIC_API_KEY
EVAL_FAITHFULNESS=1 npm run eval
```

## Going to production (the real corpus)

1. Implement `SupabaseCorpus.search()` in [`lib/rag/corpus.ts`](lib/rag/corpus.ts):
   - lexical FTS over English + a `normalize_arabic()`-indexed Arabic column,
   - dense retrieval via pgvector, fused with Reciprocal Rank Fusion,
   - optional cross-encoder re-rank of the top ~30 before taking k.
2. Set `CORPUS_BACKEND=supabase` and the Supabase + embeddings env vars.
3. Stream the answer (the scaffold returns it in one shot) and cache by query.

## Roadmap

- [ ] Supabase hybrid retrieval + embeddings
- [ ] Streaming answers with incremental citation rendering
- [ ] Cross-encoder reranking
- [ ] Larger golden eval set + CI gate on recall/faithfulness regressions
- [ ] Per-query caching and a latency budget

## License

Proprietary — see [`LICENSE`](LICENSE). Published for reference; not for reuse.
