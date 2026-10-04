import { notFound } from "next/navigation";
import { z } from "zod";

/** Route ids must be UUIDs; anything else is a 404 rather than a database error. */
export function uuidParamOr404(value: string): string {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) notFound();
  return parsed.data;
}

/** First value of a search param (Next gives string | string[] | undefined). */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
