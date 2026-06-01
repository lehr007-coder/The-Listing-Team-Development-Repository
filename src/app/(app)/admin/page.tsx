import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { supabaseForSession } from "@/lib/supabase/server";
import { PermissionToggle } from "./PermissionToggle";
import { SyncButton } from "./SyncButton";

const PAGES = ["analytics", "contacts", "leaderboard", "admin"] as const;
const ROLES = ["admin", "agent"] as const;

export default async function AdminPage() {
  const session = await requireSession();
  if (session.role !== "admin") redirect("/dashboard");

  const db = supabaseForSession(session);
  const { data: perms } = await db.from("role_permissions").select("role, page, visible");
  const map = new Map<string, boolean>();
  for (const p of perms ?? []) map.set(`${p.role}:${p.page}`, p.visible);

  async function update(formData: FormData) {
    "use server";
    const session = await requireSession();
    if (session.role !== "admin") return;
    const role = String(formData.get("role"));
    const page = String(formData.get("page"));
    const visible = formData.get("visible") === "on";
    const db = supabaseForSession(session);
    await db
      .from("role_permissions")
      .upsert({ role, page, visible }, { onConflict: "role,page" });
    revalidatePath("/admin");
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Admin · Page visibility</h1>
      <p className="mt-1 text-sm text-slate-500">
        Toggle which pages each role can see in the left navigation.
      </p>
      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
            <th className="py-2">Role</th>
            {PAGES.map((p) => (
              <th key={p}>{p}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROLES.map((role) => (
            <tr key={role} className="border-b border-slate-100">
              <td className="py-3 font-medium">{role}</td>
              {PAGES.map((page) => {
                const checked = map.get(`${role}:${page}`) ?? false;
                return (
                  <td key={page}>
                    <PermissionToggle
                      role={role}
                      page={page}
                      defaultChecked={checked}
                      action={update}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <SyncButton />
      <p className="mt-4 text-xs text-slate-500">
        Not connected yet?{" "}
        <a className="underline" href="/api/auth/ghl-oauth/install">Install the GHL app</a>.
      </p>
    </div>
  );
}
