/**
 * Text normalization + tokenization shared by the lexical retriever.
 *
 * The Arabic folding is a no-op on English text but is kept deliberately: the
 * same normalization is what the production corpus (Shia Library) indexes with,
 * so the lexical path ports unchanged to Arabic/transliterated input.
 */

/** Diacritic-insensitive Arabic folding (mirrors Shia Library's normalize_arabic). */
export function normalizeArabic(s: string): string {
  return s
    .replace(/[ً-ٰٟ]/g, "") // harakat (short vowels)
    .replace(/ـ/g, "") // tatweel (elongation)
    .replace(/[آأإ]/g, "ا") // alef variants -> bare alef
    .replace(/ى/g, "ي"); // alef maqsura -> ya
}

export function normalize(s: string): string {
  return normalizeArabic(s.toLowerCase()).replace(/[^\p{L}\p{N}\s]/gu, " ");
}

const STOPWORDS = new Set(
  ("a an and are as at be by do does for from has have how in into is it its of on or " +
    "that the this to was were what when where which who why with you your shall be been " +
    "their they them he she his her our we us not no nor")
    .split(" "),
);

/**
 * Light stemmer applied symmetrically to query and corpus, so morphological
 * variants match (e.g. "amended" / "amendment" → "amend", "punishments" →
 * "punish"). Conservative length guards and an -ss guard avoid mangling words
 * like "congress" or "press".
 */
function stem(t: string): string {
  // plural
  if (t.length > 4 && t.endsWith("ies")) t = t.slice(0, -3) + "y";
  else if (t.length > 4 && t.endsWith("es") && !t.endsWith("sses")) t = t.slice(0, -2);
  else if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) t = t.slice(0, -1);
  // light derivational folding
  if (t.length > 5 && t.endsWith("ment")) t = t.slice(0, -4);
  if (t.length > 4 && t.endsWith("ing")) t = t.slice(0, -3);
  else if (t.length > 4 && t.endsWith("ed")) t = t.slice(0, -2);
  return t;
}

export function tokenize(s: string): string[] {
  return normalize(s)
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem);
}
