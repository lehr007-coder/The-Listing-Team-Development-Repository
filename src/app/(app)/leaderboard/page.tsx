import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import { loadVisiblePages } from "@/lib/auth/permissions";

// Leaderboard intentionally aggregates across all users, so we use the
// admin client to bypass RLS. Visibility itself is gated by role_permissions.
export default async function LeaderboardPage() {
  const session = await requireSession();
  const visible = await loadVisiblePages(session);
  if (!visible.has("leaderboard")) redirect("/dashboard");

  const db = supabaseAdmin();
  const { data: users } = await db.from("users").select("id, name, email");
  const { data: rows } = await db
    .from("contact_assignments")
    .select("user_id, contacts(status, value_cents)");

  const board = new Map<string, { name: string; won: number; value: number }>();
  for (const u of users ?? []) {
    board.set(u.id, { name: u.name ?? u.email, won: 0, value: 0 });
  }
  type ContactRel = { status: string | null; value_cents: number | null };
  type Row = { user_id: string; contacts: ContactRel | ContactRel[] | null };
  for (const r of (rows ?? []) as Row[]) {
    const e = board.get(r.user_id);
    if (!e || !r.contacts) continue;
    const list = Array.isArray(r.contacts) ? r.contacts : [r.contacts];
    for (const c of list) {
      e.value += c.value_cents ?? 0;
      if (c.status === "won") e.won += 1;
    }
  }

  const sorted = [...board.entries()].sort((a, b) => b[1].value - a[1].value);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Leaderboard</h1>
      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
            <th className="py-2">#</th>
            <th>Agent</th>
            <th className="text-right">Won</th>
            <th className="text-right">Pipeline value</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(([id, e], i) => (
            <tr key={id} className="border-b border-slate-100">
              <td className="py-2">{i + 1}</td>
              <td>{e.name}</td>
              <td className="text-right">{e.won}</td>
              <td className="text-right">${(e.value / 100).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
