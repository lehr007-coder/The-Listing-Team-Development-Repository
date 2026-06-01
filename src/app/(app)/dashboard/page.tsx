import { requireSession } from "@/lib/auth/session";
import { supabaseForSession } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const session = await requireSession();
  const db = supabaseForSession(session);

  // Agents: scope analytics to contacts assigned to them.
  // Admins: still scope to *their own* assignments on this page so the
  // "personal dashboard" view is consistent regardless of role.
  const { data: assigned } = await db
    .from("contact_assignments")
    .select("contact_id")
    .eq("user_id", session.userId);
  const ids = (assigned ?? []).map((a) => a.contact_id);

  let totals = { count: 0, value: 0, won: 0 };
  if (ids.length) {
    const { data: rows } = await db
      .from("contacts")
      .select("status, value_cents")
      .in("id", ids);
    for (const r of rows ?? []) {
      totals.count += 1;
      totals.value += r.value_cents ?? 0;
      if (r.status === "won") totals.won += 1;
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">My Dashboard</h1>
      <p className="mt-1 text-sm text-slate-500">Showing only your assigned contacts.</p>
      <div className="mt-6 grid grid-cols-3 gap-4">
        <Stat label="My contacts" value={totals.count.toString()} />
        <Stat label="Won" value={totals.won.toString()} />
        <Stat label="Pipeline value" value={`$${(totals.value / 100).toLocaleString()}`} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}
