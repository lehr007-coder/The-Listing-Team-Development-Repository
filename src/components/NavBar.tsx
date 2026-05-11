import Link from "next/link";
import type { Page } from "@/lib/auth/permissions";
import type { Session } from "@/lib/auth/session";

const LINKS: { page: Page; href: string; label: string }[] = [
  { page: "analytics", href: "/dashboard", label: "Dashboard" },
  { page: "contacts", href: "/contacts", label: "Contacts" },
  { page: "leaderboard", href: "/leaderboard", label: "Leaderboard" },
  { page: "admin", href: "/admin", label: "Admin" },
];

export function NavBar({ session, visible }: { session: Session; visible: Set<Page> }) {
  return (
    <aside className="w-56 shrink-0 border-r border-slate-200 bg-white p-4">
      <div className="mb-6">
        <div className="text-sm font-semibold">{session.email}</div>
        <div className="text-xs uppercase tracking-wide text-slate-500">{session.role}</div>
      </div>
      <nav className="flex flex-col gap-1">
        {LINKS.filter((l) => visible.has(l.page)).map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
