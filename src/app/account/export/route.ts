import { buildAccountExport } from "@/features/privacy/exports";
import { getCurrentUser } from "@/lib/auth";
import { attachment, notFoundResponse } from "@/lib/route-auth";
import { createClient } from "@/lib/supabase/server";

/** The signed-in user's account data as JSON. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return notFoundResponse();
  const data = await buildAccountExport(await createClient(), user.id);
  return new Response(`${JSON.stringify(data, null, 2)}\n`, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": attachment("litbook-account.json"),
      "Cache-Control": "private, no-store",
    },
  });
}
