import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { runSyncSlice } from "@/lib/ghl/syncWorker";

export const runtime = "nodejs";
export const maxDuration = 60;

// Vercel Cron entrypoint. Auth model:
// - If CRON_SECRET is set, require "Authorization: Bearer <CRON_SECRET>"
//   (Vercel attaches it automatically to cron invocations).
// - Regardless, throttle: refuse to run if the newest sync_state row was
//   touched in the last 45s, so an unauthenticated trigger can't burn
//   API quota — the endpoint only ever advances the same bounded sync.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const db = supabaseAdmin();

  const { data: recent } = await db
    .from("sync_state")
    .select("location_id, updated_at")
    .order("updated_at", { ascending: false })
    .limit(1);
  const newest = recent?.[0]?.updated_at ? new Date(recent[0].updated_at).getTime() : 0;
  if (Date.now() - newest < 45_000) {
    return NextResponse.json({ skipped: "another run finished <45s ago" }, { status: 429 });
  }

  const { data: installs, error } = await db.from("ghl_oauth_tokens").select("location_id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results = [];
  const budgetPer = Math.max(10_000, Math.floor(40_000 / Math.max(1, installs?.length ?? 1)));
  for (const row of installs ?? []) {
    try {
      results.push(await runSyncSlice(row.location_id as string, budgetPer));
    } catch (e) {
      results.push({ locationId: row.location_id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return NextResponse.json({ results });
}
