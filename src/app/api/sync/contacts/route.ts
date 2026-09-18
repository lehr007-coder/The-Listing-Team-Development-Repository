import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { runSyncSlice } from "@/lib/ghl/syncWorker";

export const runtime = "nodejs";
export const maxDuration = 60;

// Admin-only: advance the incremental GHL sync for the caller's location.
// The same worker powers the background cron; this button just runs one
// slice on demand and reports overall progress.
export async function POST(req: NextRequest) {
  // CSRF guard: this is a cookie-authenticated, state-changing POST.
  // Browsers always attach Origin on a cross-origin POST, so reject any
  // request whose Origin isn't same-origin with the app host.
  const origin = req.headers.get("origin");
  if (origin) {
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = null;
    }
    if (!originHost || originHost !== req.headers.get("host")) {
      return NextResponse.json({ error: "Bad origin" }, { status: 403 });
    }
  }

  try {
    const session = await requireSession();
    if (session.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const locationId = session.ghlLocationId;
    if (!locationId) {
      // Session was minted before we captured the GHL location. The user
      // needs a fresh SSO login (reload the app inside GHL) to fix it.
      return NextResponse.json(
        { error: "Your session has no GHL location. Reload the app inside GoHighLevel and try again." },
        { status: 409 },
      );
    }

    const r = await runSyncSlice(locationId, 40_000);
    return NextResponse.json({
      locationId,
      phase: r.phase,
      contacts: r.contactsSynced,
      contactsTotal: r.contactsTotal,
      opportunities: r.oppsSynced,
      opportunitiesTotal: r.oppsTotal,
      passCompleted: r.passCompleted,
      note: r.skipped ?? (r.passCompleted
        ? "Full pass complete."
        : "Partial pass — the background sync keeps going automatically."),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    if (message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }
    console.error("[sync/contacts]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
