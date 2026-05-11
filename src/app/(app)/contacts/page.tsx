import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { supabaseForSession } from "@/lib/supabase/server";
import { loadVisiblePages } from "@/lib/auth/permissions";

export default async function ContactsPage() {
  const session = await requireSession();
  const visible = await loadVisiblePages(session);
  if (!visible.has("contacts")) redirect("/dashboard");

  const db = supabaseForSession(session);
  // Agents: only contacts assigned to them.
  // Admins: all contacts in the location (RLS allows it).
  let query = db
    .from("contacts")
    .select("id, name, email, phone, status, value_cents, contact_assignments!inner(user_id)")
    .order("created_at", { ascending: false });
  if (session.role !== "admin") {
    query = query.eq("contact_assignments.user_id", session.userId);
  }
  const { data: contacts } = await query;

  return (
    <div>
      <h1 className="text-2xl font-semibold">Contacts</h1>
      <p className="mt-1 text-sm text-slate-500">
        {session.role === "admin" ? "All contacts." : "Contacts assigned to you."}
      </p>
      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
            <th className="py-2">Name</th>
            <th>Email</th>
            <th>Phone</th>
            <th>Status</th>
            <th className="text-right">Value</th>
          </tr>
        </thead>
        <tbody>
          {(contacts ?? []).map((c) => (
            <tr key={c.id} className="border-b border-slate-100">
              <td className="py-2">{c.name}</td>
              <td>{c.email}</td>
              <td>{c.phone}</td>
              <td>{c.status}</td>
              <td className="text-right">${((c.value_cents ?? 0) / 100).toLocaleString()}</td>
            </tr>
          ))}
          {!contacts?.length && (
            <tr>
              <td className="py-6 text-slate-500" colSpan={5}>
                No contacts to show.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
