import { createAdminClient } from "@/lib/supabase/admin";

/** Uptime check: the app is serving and can reach the database. */
export async function GET() {
  const { error } = await createAdminClient()
    .from("organizations")
    .select("id", { head: true, count: "exact" })
    .limit(1);
  if (error) {
    console.error(JSON.stringify({ level: "error", source: "health", message: error.message }));
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
