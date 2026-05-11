import { supabaseForSession } from "@/lib/supabase/server";
import type { Session } from "@/lib/auth/session";

export type Page = "analytics" | "contacts" | "leaderboard" | "admin";

export async function loadVisiblePages(session: Session): Promise<Set<Page>> {
  const db = supabaseForSession(session);
  const { data } = await db
    .from("role_permissions")
    .select("page, visible")
    .eq("role", session.role);
  const set = new Set<Page>();
  for (const row of data ?? []) {
    if (row.visible) set.add(row.page as Page);
  }
  // Admins always see /admin even if a stray row says otherwise.
  if (session.role === "admin") set.add("admin");
  return set;
}
