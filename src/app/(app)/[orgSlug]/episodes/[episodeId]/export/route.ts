import { Zip, ZipPassThrough, strToU8 } from "fflate";
import type { NextRequest } from "next/server";

import { getEpisodeSubmissions } from "@/features/bookings/queries";
import { attachment, getOrgForRoute, notFoundResponse } from "@/lib/route-auth";
import { fileSlug, guestsMarkdown } from "@/lib/show-notes";

/**
 * Streams a ZIP of the episode's guest headshots plus guests.md. Images are
 * stored (already compressed) and added one at a time, so memory stays flat.
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/[orgSlug]/episodes/[episodeId]/export">) {
  const { orgSlug, episodeId } = await ctx.params;
  const access = await getOrgForRoute(orgSlug, episodeId);
  if (!access) return notFoundResponse();
  const { supabase, org } = access;

  const { data: episode, error } = await supabase
    .from("episodes")
    .select("id, title")
    .eq("organization_id", org.id)
    .eq("id", episodeId)
    .maybeSingle();
  if (error) throw error;
  if (!episode) return notFoundResponse();

  const guests = await getEpisodeSubmissions(org.id, episodeId);
  if (!guests.length) return new Response("No guest submissions to export yet.", { status: 404 });

  // Unique, safe file names for each headshot.
  const used = new Set<string>();
  const files = guests.map((g) => {
    if (!g.headshotPath) return { ...g, headshotFile: null };
    const ext = g.headshotPath.split(".").pop() ?? "jpg";
    const base = fileSlug(g.assets.name);
    let name = `${base}.${ext}`;
    for (let i = 2; used.has(name); i++) name = `${base}-${i}.${ext}`;
    used.add(name);
    return { ...g, headshotFile: `headshots/${name}` };
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const zip = new Zip((err, chunk, final) => {
        if (err) return controller.error(err);
        controller.enqueue(chunk);
        if (final) controller.close();
      });
      try {
        const md = new ZipPassThrough("guests.md");
        zip.add(md);
        md.push(
          strToU8(
            guestsMarkdown(
              episode.title,
              files.map((f) => ({ ...f.assets, headshotFile: f.headshotFile })),
            ),
          ),
          true,
        );

        for (const f of files) {
          if (!f.headshotPath || !f.headshotFile) continue;
          const { data: blob, error: downloadError } = await supabase.storage
            .from("guest-assets")
            .download(f.headshotPath);
          if (downloadError) {
            console.error("[export] could not download headshot", f.headshotPath, downloadError);
            continue;
          }
          const entry = new ZipPassThrough(f.headshotFile);
          zip.add(entry);
          entry.push(new Uint8Array(await blob.arrayBuffer()), true);
        }
        zip.end();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": attachment(`${fileSlug(episode.title)}-guests.zip`),
      "Cache-Control": "private, no-store",
    },
  });
}
