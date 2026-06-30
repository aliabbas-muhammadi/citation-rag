"use client";

import { useEffect, useRef } from "react";
import type { Passage } from "@/lib/rag";

type Props = {
  /** The retrieved passage the citation points at. */
  passage: Passage;
  /** 1-based source number, as shown in the [n] chip and the Sources list. */
  index: number;
  /** The exact span the model cited (from Anthropic's native citations). */
  citedText: string;
  onClose: () => void;
};

/**
 * Split a passage around the cited span so it can be highlighted in context.
 * Anthropic's `cited_text` is an exact substring of the document, so a plain
 * indexOf almost always hits; if it doesn't (rare whitespace drift), we bail
 * and the dialog shows the quote separately instead of guessing.
 */
function splitOnQuote(
  text: string,
  quote: string,
): { before: string; match: string; after: string } | null {
  const q = quote.trim();
  if (!q) return null;
  const idx = text.indexOf(q);
  if (idx === -1) return null;
  return {
    before: text.slice(0, idx),
    match: text.slice(idx, idx + q.length),
    after: text.slice(idx + q.length),
  };
}

/**
 * Modal showing the full retrieved passage with the cited span highlighted —
 * so a reader can check any claim in context, not just read a tooltip. Closes
 * on Escape, backdrop click, or the close button; focus moves to close on open.
 */
export function CitationDialog({ passage, index, citedText, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const split = splitOnQuote(passage.text, citedText);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Source ${index}: ${passage.book} ${passage.section}`}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-[1px] sm:items-center sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-line-strong bg-paper-raised p-5 shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="text-sm text-ink">
            <span className="font-mono text-xs text-accent">[{index}]</span>{" "}
            <span className="font-medium">
              {passage.book} — {passage.section} {passage.number}
            </span>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 rounded-md px-2 py-1 text-ink-faint transition-colors hover:bg-paper-sunken hover:text-ink"
          >
            ✕
          </button>
        </div>

        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">
          {split ? (
            <>
              {split.before}
              <mark className="cite-mark">{split.match}</mark>
              {split.after}
            </>
          ) : (
            passage.text
          )}
        </p>

        {!split && citedText.trim() && (
          <div className="mt-3 rounded-lg border-l-2 border-accent bg-accent-soft/50 px-3 py-2 text-xs text-ink-muted">
            <span className="font-semibold text-ink">Cited span:</span> “{citedText.trim()}”
          </div>
        )}
      </div>
    </div>
  );
}
