import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { loadVisiblePages } from "@/lib/auth/permissions";
import { NavBar } from "@/components/NavBar";
import type { ReactNode } from "react";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/");
  const visible = await loadVisiblePages(session);
  return (
    <div className="flex min-h-screen">
      <NavBar session={session} visible={visible} />
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
