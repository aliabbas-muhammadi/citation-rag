/**
 * The Critical Edition specimen — the signature hero object. A printed exhibit (not
 * a live demo): one real cited claim with a superscript [1], a leader rule, and the
 * verbatim source span set beneath it as ink-underlined marginalia. It SHOWS the
 * product's thesis — "answers you can verify, line by line" — above the fold,
 * before a single click. Fully static: no caret, no stream, no pulse.
 */
export function FootnoteSpecimen() {
  return (
    <figure className="overflow-hidden rounded-2xl border border-line-strong bg-paper-raised sheen-top">
      <div className="flex items-center justify-between border-b border-line-strong bg-paper-sunken/60 px-5 py-3">
        <span className="eyebrow">The specimen · one cited claim</span>
        <span className="font-mono text-[0.62rem] uppercase tracking-[0.1em] text-ink-faint">
          verbatim source
        </span>
      </div>

      <div className="p-5 sm:p-7">
        {/* The claim, with a real footnote marker */}
        <p className="text-lg leading-relaxed text-ink">
          The First Amendment bars Congress from establishing a religion or
          prohibiting the free exercise thereof.
          <sup className="ml-0.5 align-super">
            <span className="rounded-[3px] border-b border-accent/50 bg-accent-soft px-1 font-mono text-[0.64rem] font-medium text-accent-strong">
              1
            </span>
          </sup>
        </p>

        {/* Leader + the source apparatus */}
        <div className="mt-6 flex items-baseline gap-3">
          <span className="font-mono text-[0.7rem] text-accent">[1]</span>
          <span className="rule flex-1" />
          <span className="font-mono text-[0.62rem] uppercase tracking-[0.1em] text-ink-faint">
            U.S. Constitution — Amendment I
          </span>
        </div>

        <p className="mt-3 text-[0.95rem] leading-relaxed text-ink-muted">
          <mark className="bg-accent-soft/70 text-ink [box-decoration-break:clone] [-webkit-box-decoration-break:clone] pb-px [border-bottom:1.5px_solid_var(--color-accent)]">
            Congress shall make no law respecting an establishment of religion, or
            prohibiting the free exercise thereof
          </mark>
          ; or abridging the freedom of speech, or of the press; or the right of the
          people peaceably to assemble…
        </p>
      </div>

      <figcaption className="border-t border-line px-5 py-3.5 text-sm leading-relaxed text-ink-muted">
        Every span links to a verbatim source — or the engine abstains. Native
        citations, not made-up&nbsp;[1]s.
      </figcaption>
    </figure>
  );
}
