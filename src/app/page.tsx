import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await getSession();
  if (session) redirect("/dashboard");
  return (
    <main className="mx-auto max-w-xl p-10">
      <h1 className="text-2xl font-semibold">The Listing Team Dashboard</h1>
      <p className="mt-3 text-slate-600">
        Open this dashboard from your GoHighLevel left-hand menu to sign in automatically.
      </p>
      <p className="mt-4 text-sm text-slate-500">
        Admins can also visit{" "}
        <Link className="underline" href="/admin">/admin</Link> after sign-in.
      </p>
    </main>
  );
}
