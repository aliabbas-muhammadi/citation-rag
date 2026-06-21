import { getCorpus } from "./corpus";
import type { RetrievedChunk } from "./types";

/**
 * Retrieve the top-k passages for a query.
 *
 * The corpus backend (mock vs Supabase hybrid) is selected by env. A
 * cross-encoder re-rank step would slot in here, over the top ~30 candidates,
 * before returning k.
 */
export async function retrieve(query: string, k = 5): Promise<RetrievedChunk[]> {
  return getCorpus().search(query, k);
}
