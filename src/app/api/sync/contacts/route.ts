import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import { listContactsPaged } from "@/lib/ghl/api";

export const runtime = "nodejs";
export const maxDuration = 60;

// Admin-only: pull all contacts for the caller's location from GHL and
// upsert them into our DB, rebuilding assignments from GHL's `assignedTo`.
export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const locationId = session.ghlLocationId;
  const db = supabaseAdmin();
  const ghlContacts = await listContactsPaged(locationId);

  // 1. Upsert contacts.
  const contactRows = ghlContacts.map((c) => ({
    ghl_contact_id: c.id,
    ghl_location_id: locationId,
        name: (c.contactName ?? [c.firstName, c.lastName].filter(Boolean).join(" ")) || null,
    email: c.email ?? null,
    phone: c.phone ?? null,
    status: null,
    value_cents: 0,
  }));
  if (contactRows.length) {
    await db.from("contacts").upsert(contactRows, { onConflict: "ghl_contact_id" });
  }

  // 2. Map GHL user ids -> our user ids. Auto-create stub rows for any
  //    GHL user we haven't seen yet so contacts can still be assigned.
  const ghlUserIds = [...new Set(ghlContacts.map((c) => c.assignedTo).filter(Boolean) as string[])];
  if (ghlUserIds.length) {
    await db
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
  }
  const { data: userRows } = await db
    .from("users")
    .select("id, ghl_user_id")
    .in("ghl_user_id", ghlUserIds.length ? ghlUserIds : [""]);
  const userByGhl = new Map((userRows ?? []).map((u) => [u.ghl_user_id, u.id as string]));

  const { data: contactRowsDb } = await db
    .from("contacts")
    .select("id, ghl_contact_id")
    .eq("ghl_location_id", locationId);
  const contactByGhl = new Map(
    (contactRowsDb ?? []).map((c) => [c.ghl_contact_id as string, c.id as string]),
  );

  // 3. Rebuild assignments for this location's contacts.
  const assignments = ghlContacts
    .filter((c) => c.assignedTo && userByGhl.has(c.assignedTo!) && contactByGhl.has(c.id))
    .map((c) => ({
      user_id: userByGhl.get(c.assignedTo!)!,
      contact_id: contactByGhl.get(c.id)!,
    }));

  const contactIds = ghlContacts.map((c) => contactByGhl.get(c.id)).filter(Boolean) as string[];
  if (contactIds.length) {
    await db.from("contact_assignments").delete().in("contact_id", contactIds);
  }
  if (assignments.length) {
    await db.from("contact_assignments").insert(assignments);
  }

  return NextResponse.json({
    locationId,
    contacts: ghlContacts.length,
    assignments: assignments.length,
  });
}
