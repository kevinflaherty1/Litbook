import type { PostgrestError } from "@supabase/supabase-js";

export const PAGE_SIZE = 25;

/** Row range for a 1-based page, for supabase-js `.range(from, to)`. */
export function pageRange(page: number, pageSize = PAGE_SIZE): [number, number] {
  const from = (page - 1) * pageSize;
  return [from, from + pageSize - 1];
}

/** PostgREST answers a page past the end with 416 / PGRST103 instead of an empty list. */
export function isRangeError(error: PostgrestError | null) {
  return error?.code === "PGRST103";
}
