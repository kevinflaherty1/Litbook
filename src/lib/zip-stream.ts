import "server-only";

import { strToU8, Zip, ZipPassThrough } from "fflate";

import { attachment } from "@/lib/route-auth";

export type AddToZip = (name: string, data: Uint8Array | string) => void;

/**
 * A streamed ZIP download. Entries are stored (no recompression) and written
 * as soon as they're added, so memory stays flat for large exports.
 */
export function zipResponse(filename: string, build: (add: AddToZip) => Promise<void>) {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const zip = new Zip((err, chunk, final) => {
        if (err) return controller.error(err);
        controller.enqueue(chunk);
        if (final) controller.close();
      });
      const add: AddToZip = (name, data) => {
        const entry = new ZipPassThrough(name);
        zip.add(entry);
        entry.push(typeof data === "string" ? strToU8(data) : data, true);
      };
      try {
        await build(add);
        zip.end();
      } catch (err) {
        console.error("[zip] export failed", err);
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": attachment(filename),
      "Cache-Control": "private, no-store",
    },
  });
}

export const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/**
 * Reads every row of a query in pages (PostgREST caps responses at 1,000
 * rows). `page` receives an inclusive range.
 */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  size = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < size) return rows;
  }
}
