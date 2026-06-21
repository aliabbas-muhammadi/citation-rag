import { retrieve } from "./retrieve";
import { generateAnswer } from "./generate";
import type { RagAnswer } from "./types";

export * from "./types";
export { retrieve } from "./retrieve";

/** Full pipeline: retrieve top-k passages, then answer with inline citations. */
export async function ask(question: string, k = 5): Promise<RagAnswer> {
  const chunks = await retrieve(question, k);
  return generateAnswer(
    question,
    chunks.map((c) => c.passage),
  );
}
