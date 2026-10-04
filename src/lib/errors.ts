import type { PostgrestError } from "@supabase/supabase-js";

/** Postgres SQLSTATE codes raised by our schema and RPCs. */
export const PG = {
  uniqueViolation: "23505",
  checkViolation: "23514",
  foreignKeyViolation: "23503",
  insufficientPrivilege: "42501",
  noDataFound: "P0002",
  invalidParameter: "22023",
} as const;

export function isPgError(error: unknown, code: string): error is PostgrestError {
  return typeof error === "object" && error !== null && (error as PostgrestError).code === code;
}
