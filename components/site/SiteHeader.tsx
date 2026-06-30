import Link from "next/link";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

/**
 * Slim sticky header — the wordmark with the verdigris brand dot, the demo + source
 * links, and the theme toggle. Server component; only the toggle is a client island.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5 sm:px-8">
        <Link href="/" className="group inline-flex items-baseline gap-2">
          <span className="verdigris--dot inline-block h-1.5 w-1.5 self-center">
            <span className="block h-full w-full rounded-full bg-accent" />
          </span>
          <span className="font-serif text-lg leading-none text-ink">Citation&nbsp;RAG</span>
          <span className="hidden font-mono text-[0.6rem] uppercase tracking-[0.18em] text-ink-faint sm:inline">
            grounded answers
          </span>
        </Link>
        <nav className="flex items-center gap-0.5 sm:gap-1">
          <Link
            href="/ask"
            className="rounded-md px-3 py-2 text-sm text-ink-muted transition-colors hover:text-ink"
          >
            Ask the corpus
          </Link>
          <a
            href="https://github.com/aliabbas-muhammadi/citation-rag"
            target="_blank"
            rel="noreferrer"
            className="hidden rounded-md px-3 py-2 text-sm text-ink-muted transition-colors hover:text-ink sm:inline-block"
          >
            Source
          </a>
          <ThemeToggle className="ml-1" />
        </nav>
      </div>
    </header>
  );
}
