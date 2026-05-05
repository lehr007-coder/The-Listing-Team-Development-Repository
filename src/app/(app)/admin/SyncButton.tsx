"use client";

import { useState } from "react";

export function SyncButton() {
  const [state, setState] = useState<"idle" | "running" | { ok: boolean; msg: string }>("idle");

  async function run() {
    setState("running");
    try {
      const res = await fetch("/api/sync/contacts", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setState({ ok: true, msg: `Synced ${json.contacts} contacts, ${json.assignments} assignments.` });
    } catch (e) {
      setState({ ok: false, msg: e instanceof Error ? e.message : "Sync failed" });
    }
  }

  return (
    <div className="mt-8 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">GHL contact sync</div>
          <div className="text-sm text-slate-500">
            Pull contacts and assignments for this location from GoHighLevel.
          </div>
        </div>
        <button
          onClick={run}
          disabled={state === "running"}
          className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {state === "running" ? "Syncing..." : "Sync now"}
        </button>
      </div>
      {typeof state === "object" && (
        <div
          className={`mt-3 text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`}
        >
          {state.msg}
        </div>
      )}
    </div>
  );
}
