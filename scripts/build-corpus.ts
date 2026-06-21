/**
 * Build the demo corpus from public-domain U.S. founding documents.
 *
 * Sources (Project Gutenberg, public domain):
 *   - The U.S. Constitution, 1787      (eBook #5)
 *   - The U.S. Bill of Rights          (eBook #2)
 *   - The Federalist Papers            (eBook #1404)
 *
 * Produces `data/corpus.json` — an array of citation-ready Passage records.
 * Run occasionally to regenerate; the OUTPUT is committed (it is derived from
 * public-domain text, so it is safe to commit and keeps the build offline).
 *
 *   npm run build:corpus
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

type Passage = {
  id: string;
  book: string;
  section: string;
  number: string;
  text: string;
};

const SOURCES = {
  constitution: "https://www.gutenberg.org/cache/epub/5/pg5.txt",
  billOfRights: "https://www.gutenberg.org/cache/epub/2/pg2.txt",
  federalist: "https://www.gutenberg.org/cache/epub/1404/pg1404.txt",
};

// Curated, well-known Federalist papers with high Q&A value. Keeps the corpus
// substantial (~250 passages) without ingesting all 85 essays verbatim.
const FEDERALIST_PICKS = [1, 2, 6, 9, 10, 14, 15, 23, 39, 47, 48, 51, 62, 68, 70, 78, 84, 85];

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const WORD_TO_NUM: Record<string, number> = {
  ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6, SEVEN: 7,
};

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
  return res.text();
}

/** Strip Project Gutenberg header/footer, returning just the work body. */
function stripGutenberg(raw: string): string {
  const norm = raw.replace(/\r\n/g, "\n");
  const startMatch = norm.match(/\*\*\* START OF THE PROJECT GUTENBERG.*?\*\*\*/s);
  const endMatch = norm.match(/\*\*\* END OF THE PROJECT GUTENBERG.*?\*\*\*/s);
  let body = norm;
  if (startMatch) body = body.slice(startMatch.index! + startMatch[0].length);
  if (endMatch) {
    const endIdx = body.indexOf(endMatch[0]);
    if (endIdx !== -1) body = body.slice(0, endIdx);
  }
  return body;
}

/** Split a block into clean paragraphs (blank-line separated, line-wrapping removed). */
function paragraphs(block: string): string[] {
  return block
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** Merge short paragraphs into ~90–260 word chunks for retrieval-friendly passages. */
function chunkParagraphs(paras: string[], min = 90, max = 260): string[] {
  const chunks: string[] = [];
  let buf: string[] = [];
  let count = 0;
  const flush = () => {
    if (buf.length) chunks.push(buf.join(" "));
    buf = [];
    count = 0;
  };
  for (const p of paras) {
    const w = wordCount(p);
    if (w >= max) {
      flush();
      chunks.push(p);
      continue;
    }
    buf.push(p);
    count += w;
    if (count >= min) flush();
  }
  flush();
  return chunks;
}

// --------------------------------------------------------------------------
// Constitution (1787)
// --------------------------------------------------------------------------
function parseConstitution(raw: string): Passage[] {
  const body = stripGutenberg(raw);
  // Keep from the preamble up to the signature block.
  const start = body.search(/We the people of the United States/i);
  const sigIdx = body.search(/Go\. WASHINGTON/);
  const main = body.slice(start === -1 ? 0 : start, sigIdx === -1 ? undefined : sigIdx);

  const out: Passage[] = [];
  const BOOK = "U.S. Constitution";

  // Split on article headers ("Article 1", "ARTICLE THREE", ...).
  const parts = main.split(/^(?:Article|ARTICLE)\s+([0-9A-Za-z]+)\s*$/m);

  // parts[0] = preamble region
  const preamble = paragraphs(parts[0]).find((p) => /We the people/i.test(p));
  if (preamble) {
    out.push({ id: "const-preamble", book: BOOK, section: "Preamble", number: "", text: preamble });
  }

  for (let i = 1; i < parts.length; i += 2) {
    const token = parts[i].toUpperCase();
    const artNum = /^\d+$/.test(token) ? parseInt(token, 10) : WORD_TO_NUM[token];
    if (!artNum) continue;
    const roman = ROMAN[artNum];
    const content = parts[i + 1] ?? "";

    // Split the article into "Section N." units.
    const secParts = content.split(/^Section\s+(\d+)\.\s*/m);
    if (secParts.length === 1) {
      // No sections: emit each paragraph of the article.
      paragraphs(content).forEach((p, idx) => {
        out.push({
          id: `const-art${artNum}-p${idx + 1}`,
          book: BOOK,
          section: `Article ${roman}`,
          number: `¶${idx + 1}`,
          text: p,
        });
      });
      continue;
    }
    for (let s = 1; s < secParts.length; s += 2) {
      const secNum = secParts[s];
      const secText = paragraphs(secParts[s + 1] ?? "").join("\n\n");
      if (!secText) continue;
      out.push({
        id: `const-art${artNum}-sec${secNum}`,
        book: BOOK,
        section: `Article ${roman}`,
        number: `Section ${secNum}`,
        text: secText,
      });
    }
  }
  return out;
}

// --------------------------------------------------------------------------
// Bill of Rights (first 10 amendments)
// --------------------------------------------------------------------------
function parseBillOfRights(raw: string): Passage[] {
  const body = stripGutenberg(raw);
  const start = body.search(/^I\s*$/m);
  const main = body.slice(start);
  const parts = main.split(/^([IVX]+)\s*$/m);
  const out: Passage[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const roman = parts[i];
    const text = paragraphs(parts[i + 1] ?? "").join(" ");
    if (!text) continue;
    out.push({
      id: `bor-am-${roman}`,
      book: "U.S. Constitution",
      section: "Bill of Rights",
      number: `Amendment ${roman}`,
      text,
    });
  }
  return out;
}

// --------------------------------------------------------------------------
// Federalist Papers (curated subset)
// --------------------------------------------------------------------------
function parseFederalist(raw: string): Passage[] {
  const body = stripGutenberg(raw);
  const headerRe = /^FEDERALIST No\. (\d+)\s*$/gm;
  const marks: { num: number; index: number; headerEnd: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = headerRe.exec(body))) {
    marks.push({ num: parseInt(m[1], 10), index: m.index, headerEnd: m.index + m[0].length });
  }

  const out: Passage[] = [];
  for (let i = 0; i < marks.length; i++) {
    const { num, headerEnd } = marks[i];
    if (!FEDERALIST_PICKS.includes(num)) continue;
    const end = i + 1 < marks.length ? marks[i + 1].index : body.length;
    const slice = body.slice(headerEnd, end);

    // Front matter ends at the salutation; body is everything after it.
    const salutation = slice.search(/To the People of the State of New[ -]?York:/i);
    const front = salutation === -1 ? slice.slice(0, 400) : slice.slice(0, salutation);
    let bodyText = salutation === -1 ? slice : slice.slice(slice.indexOf(":", salutation) + 1);

    // Drop the "PUBLIUS" signature and the footnotes that trail it.
    const pubIdx = bodyText.search(/\bPUBLIUS\b/);
    if (pubIdx !== -1) bodyText = bodyText.slice(0, pubIdx);

    const authors = ["HAMILTON", "MADISON", "JAY"].filter((a) =>
      new RegExp(`\\b${a}\\b`).test(front),
    );
    const author = authors
      .map((a) => a[0] + a.slice(1).toLowerCase())
      .join(" / ");

    const chunks = chunkParagraphs(paragraphs(bodyText));
    chunks.forEach((text, idx) => {
      out.push({
        id: `fed-${num}-${idx + 1}`,
        book: "Federalist Papers",
        section: author ? `No. ${num} (${author})` : `No. ${num}`,
        number: `¶${idx + 1}`,
        text,
      });
    });
  }
  return out;
}

async function main() {
  console.log("Fetching public-domain sources from Project Gutenberg…");
  const [cRaw, bRaw, fRaw] = await Promise.all([
    fetchText(SOURCES.constitution),
    fetchText(SOURCES.billOfRights),
    fetchText(SOURCES.federalist),
  ]);

  const constitution = parseConstitution(cRaw);
  const billOfRights = parseBillOfRights(bRaw);
  const federalist = parseFederalist(fRaw);

  const corpus = [...constitution, ...billOfRights, ...federalist];

  // Sanity checks — fail loudly if a parser silently produced nothing.
  if (constitution.length < 20) throw new Error(`Constitution parse too small: ${constitution.length}`);
  if (billOfRights.length !== 10) throw new Error(`Bill of Rights expected 10, got ${billOfRights.length}`);
  if (federalist.length < 100) throw new Error(`Federalist parse too small: ${federalist.length}`);

  const ids = new Set(corpus.map((p) => p.id));
  if (ids.size !== corpus.length) throw new Error("Duplicate passage IDs detected");

  const outPath = join(process.cwd(), "data", "corpus.json");
  writeFileSync(outPath, JSON.stringify(corpus, null, 2) + "\n");

  console.log(
    `Wrote ${corpus.length} passages → data/corpus.json\n` +
      `  Constitution: ${constitution.length}\n` +
      `  Bill of Rights: ${billOfRights.length}\n` +
      `  Federalist (${FEDERALIST_PICKS.length} papers): ${federalist.length}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
