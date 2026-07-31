import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import { listContactsPaged } from "@/lib/ghl/api";

export const runtime = "nodejs";
export const maxDuration = 60;

const CHUNK = 500;

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Admin-only: pull contacts for the caller's location from GHL and
// upsert them into our DB, rebuilding assignments from GHL's `assignedTo`.
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

    const db = supabaseAdmin();
    const ghlContacts = await listContactsPaged(locationId);

    // 1. Upsert contacts (chunked: PostgREST rejects oversized payloads).
    const contactRows = ghlContacts.map((c) => ({
      ghl_contact_id: c.id,
      ghl_location_id: locationId,
      name: (c.contactName ?? [c.firstName, c.lastName].filter(Boolean).join(" ")) || null,
      email: c.email ?? null,
      phone: c.phone ?? null,
      status: null,
      value_cents: 0,
    }));
    for (const batch of chunks(contactRows, CHUNK)) {
      const { error } = await db.from("contacts").upsert(batch, { onConflict: "ghl_contact_id" });
      if (error) throw new Error(`contacts upsert failed: ${error.message}`);
    }

    // 2. Map GHL user ids -> our user ids. Auto-create stub rows for any
    //    GHL user we haven't seen yet so contacts can still be assigned.
    const ghlUserIds = [...new Set(ghlContacts.map((c) => c.assignedTo).filter(Boolean) as string[])];
    if (ghlUserIds.length) {
      const { error } = await db
        .from("users")
        .upsert(
          ghlUserIds.map((id) => ({
            ghl_user_id: id,
            ghl_location_id: locationId,
            email: `${id}@ghl.placeholder`,
            role: "agent" as const,
          })),
          { onConflict: "ghl_user_id", ignoreDuplicates: true },
        );
      if (error) throw new Error(`users upsert failed: ${error.message}`);
    }
    const userByGhl = new Map<string, string>();
    for (const batch of chunks(ghlUserIds, CHUNK)) {
      const { data, error } = await db.from("users").select("id, ghl_user_id").in("ghl_user_id", batch);
      if (error) throw new Error(`users select failed: ${error.message}`);
      for (const u of data ?? []) userByGhl.set(u.ghl_user_id as string, u.id as string);
    }

    // Resolve DB ids for the synced contacts. Chunked .in() instead of one
    // .eq(location) select: PostgREST caps un-ranged selects at 1000 rows,
    // which silently truncated the map and dropped assignments.
    const contactByGhl = new Map<string, string>();
    const ghlContactIds = ghlContacts.map((c) => c.id);
    for (const batch of chunks(ghlContactIds, CHUNK)) {
      const { data, error } = await db
        .from("contacts")
        .select("id, ghl_contact_id")
        .in("ghl_contact_id", batch);
      if (error) throw new Error(`contacts select failed: ${error.message}`);
      for (const c of data ?? []) contactByGhl.set(c.ghl_contact_id as string, c.id as string);
    }

    // 3. Rebuild assignments for the synced contacts.
    const assignments = ghlContacts
      .filter((c) => c.assignedTo && userByGhl.has(c.assignedTo!) && contactByGhl.has(c.id))
      .map((c) => ({
        user_id: userByGhl.get(c.assignedTo!)!,
        contact_id: contactByGhl.get(c.id)!,
      }));

    const contactIds = ghlContacts.map((c) => contactByGhl.get(c.id)).filter(Boolean) as string[];
    for (const batch of chunks(contactIds, CHUNK)) {
      const { error } = await db.from("contact_assignments").delete().in("contact_id", batch);
      if (error) throw new Error(`assignments delete failed: ${error.message}`);
    }
    for (const batch of chunks(assignments, CHUNK)) {
      const { error } = await db.from("contact_assignments").insert(batch);
      if (error) throw new Error(`assignments insert failed: ${error.message}`);
    }

    return NextResponse.json({
      locationId,
      contacts: ghlContacts.length,
      assignments: assignments.length,
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
