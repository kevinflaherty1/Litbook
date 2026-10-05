import type { NextRequest } from "next/server";

import { getEpisodeSubmissions } from "@/features/bookings/queries";
import { answeredQuestions, listCustomFields } from "@/features/custom-fields/queries";
import { getOrgForRoute, notFoundResponse } from "@/lib/route-auth";
import { ASSET_SPECS } from "@/schemas/assets";
import { fileSlug, guestsMarkdown } from "@/lib/show-notes";
import { zipResponse } from "@/lib/zip-stream";

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

  const [guests, customFields] = await Promise.all([
    getEpisodeSubmissions(org.id, episodeId),
    listCustomFields(org.id),
  ]);
  if (!guests.length) return new Response("No guest submissions to export yet.", { status: 404 });

  // Unique, safe file names for each headshot.
  const used = new Set<string>();
  const unique = (base: string, ext: string) => {
    let name = `${base}.${ext}`;
    for (let i = 2; used.has(name); i++) name = `${base}-${i}.${ext}`;
    used.add(name);
    return name;
  };
  const files = guests.map((g) => {
    const base = fileSlug(g.assets.name);
    const extras = g.files.map((f) => ({
      path: f.path,
      label: ASSET_SPECS[f.kind].label,
      zipName: `files/${unique(`${base}-${f.kind.replace(/_/g, "-")}`, f.path.split(".").pop() ?? "bin")}`,
    }));
    if (!g.headshotPath) return { ...g, headshotFile: null, extras };
    return {
      ...g,
      headshotFile: `headshots/${unique(base, g.headshotPath.split(".").pop() ?? "jpg")}`,
      extras,
    };
  });

  return zipResponse(`${fileSlug(episode.title)}-guests.zip`, async (add) => {
    add(
      "guests.md",
      guestsMarkdown(
        episode.title,
        files.map((f) => ({
          ...f.assets,
          headshotFile: f.headshotFile,
          answers: answeredQuestions(customFields, f.customAnswers),
          files: f.extras.map((e) => ({ label: e.label, file: e.zipName })),
        })),
      ),
    );
    const downloads = files.flatMap((f) => [
      ...(f.headshotPath && f.headshotFile ? [{ path: f.headshotPath, zipName: f.headshotFile }] : []),
      ...f.extras,
    ]);
    for (const d of downloads) {
      const { data: blob, error: downloadError } = await supabase.storage
        .from("guest-assets")
        .download(d.path);
      if (downloadError) {
        console.error("[export] could not download", d.path, downloadError);
        continue;
      }
      add(d.zipName, new Uint8Array(await blob.arrayBuffer()));
    }
  });
}
