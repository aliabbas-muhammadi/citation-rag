/** Core types for the citation-grounded RAG engine. */

/** One retrievable unit of the corpus. Mirrors a real library schema. */
export type Passage = {
  id: string;
  book: string;
  section: string;
  /** Citation number scholars use — hadith/page/paragraph number. */
  number: string;
  text: string;
  lang?: "en" | "ar" | "fa";
  /** Optional precomputed embedding (used by the mock corpus only). */
  embedding?: number[];
};

export type RetrievedChunk = {
  passage: Passage;
  /** Higher = more relevant. Scale is backend-specific. */
  score: number;
};

/** A verifiable link from a span of the answer back to a source passage. */
export type Citation = {
  /** 1-based index into RagAnswer.sources. */
  sourceIndex: number;
  /** The exact text in the source that supports the claim. */
  citedText: string;
  passageId: string;
};

/** A run of answer text plus the citations that ground it. */
export type AnswerSegment = {
  text: string;
  citations: Citation[];
};

export type RagAnswer = {
  /** Ordered answer text; render segments in sequence with inline citations. */
  segments: AnswerSegment[];
  /** The passages retrieved for this question, in citation order (1-based). */
  sources: Passage[];
  /** True when the model declined because the sources didn't support an answer. */
  abstained: boolean;
  model: string;
  usage?: { inputTokens: number; outputTokens: number };
};
