import { requireSession } from "@/lib/auth/session";
import { supabaseForSession } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const session = await requireSession();
  const db = supabaseForSession(session);

  // Agents: scope analytics to contacts assigned to them.
  // Admins: still scope to *their own* assignments on this page so the
  // "personal dashboard" view is consistent regardless of role.
  //
  // Aggregate in SQL: with 100k+ contacts synced, fetching assignment
  // rows and re-querying with .in() blows past PostgREST's 1000-row cap
  // and URL limits, silently rendering zeros.
  const { data, error } = await db.rpc("user_dashboard_totals", {
    p_user_id: session.userId,
  });
  if (error) console.error("[dashboard] totals rpc failed:", error.message);
  const row = Array.isArray(data) ? data[0] : data;
  const totals = {
    count: Number(row?.contact_count ?? 0),
    won: Number(row?.won_count ?? 0),
    value: Number(row?.value_cents_sum ?? 0),
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold">My Dashboard</h1>
      <p className="mt-1 text-sm text-slate-500">Showing only your assigned contacts.</p>
      <div className="mt-6 grid grid-cols-3 gap-4">
        <Stat label="My contacts" value={totals.count.toLocaleString()} />
        <Stat label="Won" value={totals.won.toLocaleString()} />
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
