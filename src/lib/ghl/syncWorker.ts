import { supabaseAdmin } from "@/lib/supabase/server";
import { ghlFetch, GhlContact, GhlOpportunity } from "@/lib/ghl/api";

// Incremental, resumable sync. Each call does a bounded slice of work
// (time-budgeted), persists its cursor in sync_state, and returns
// progress. A full pass walks contacts first, then opportunities,
// then marks the pass done; the next trigger after REST_MINUTES
// starts a fresh pass so data stays current.

const PAGE = 100;
const REST_MINUTES = 30;

const CHUNK = 500;
function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

type SyncState = {
  location_id: string;
  phase: "contacts" | "opportunities" | "done";
  contact_cursor: { startAfterId?: string; startAfter?: number } | null;
  opp_cursor: { startAfterId?: string; startAfter?: number } | null;
  opp_page: number;
  contacts_total: number | null;
  opps_total: number | null;
  contacts_synced: number;
  opps_synced: number;
  pass_started_at: string | null;
  completed_at: string | null;
  last_error: string | null;
};

export type SliceResult = {
  locationId: string;
  phase: string;
  contactsSynced: number;
  contactsTotal: number | null;
  oppsSynced: number;
  oppsTotal: number | null;
  pagesProcessed: number;
  passCompleted: boolean;
  skipped?: string;
};

async function loadState(locationId: string): Promise<SyncState> {
  const db = supabaseAdmin();
  const { data } = await db.from("sync_state").select("*").eq("location_id", locationId).maybeSingle();
  if (data) return data as SyncState;
  const fresh: Partial<SyncState> = { location_id: locationId, phase: "contacts", opp_page: 1 };
  await db.from("sync_state").upsert(fresh, { onConflict: "location_id" });
  return { ...(fresh as SyncState), contact_cursor: null, opp_cursor: null, contacts_synced: 0, opps_synced: 0, contacts_total: null, opps_total: null, pass_started_at: null, completed_at: null, last_error: null };
}

async function saveState(patch: Partial<SyncState> & { location_id: string }) {
  const db = supabaseAdmin();
  const { error } = await db
    .from("sync_state")
    .upsert({ ...patch, updated_at: new Date().toISOString() }, { onConflict: "location_id" });
  if (error) console.error("[syncWorker] state save failed:", error.message);
}

async function upsertContactBatch(locationId: string, batch: GhlContact[]) {
  const db = supabaseAdmin();
  // Omit status/value_cents so we never clobber values computed from
  // the opportunities table (PostgREST only updates provided columns).
  const rows = batch.map((c) => ({
    ghl_contact_id: c.id,
    ghl_location_id: locationId,
    name: (c.contactName ?? [c.firstName, c.lastName].filter(Boolean).join(" ")) || null,
    email: c.email ?? null,
    phone: c.phone ?? null,
  }));
  for (const part of chunks(rows, CHUNK)) {
    const { error } = await db.from("contacts").upsert(part, { onConflict: "ghl_contact_id" });
    if (error) throw new Error(`contacts upsert failed: ${error.message}`);
  }

  // Stub users for unseen assignees, then rebuild assignments for batch.
  const ghlUserIds = [...new Set(batch.map((c) => c.assignedTo).filter(Boolean) as string[])];
  if (ghlUserIds.length) {
    const { error } = await db.from("users").upsert(
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
  for (const part of chunks(ghlUserIds, CHUNK)) {
    const { data, error } = await db.from("users").select("id, ghl_user_id").in("ghl_user_id", part);
    if (error) throw new Error(`users select failed: ${error.message}`);
    for (const u of data ?? []) userByGhl.set(u.ghl_user_id as string, u.id as string);
  }
  const contactByGhl = new Map<string, string>();
  for (const part of chunks(batch.map((c) => c.id), CHUNK)) {
    const { data, error } = await db.from("contacts").select("id, ghl_contact_id").in("ghl_contact_id", part);
    if (error) throw new Error(`contacts select failed: ${error.message}`);
    for (const c of data ?? []) contactByGhl.set(c.ghl_contact_id as string, c.id as string);
  }
  const assignments = batch
    .filter((c) => c.assignedTo && userByGhl.has(c.assignedTo!) && contactByGhl.has(c.id))
    .map((c) => ({ user_id: userByGhl.get(c.assignedTo!)!, contact_id: contactByGhl.get(c.id)! }));
  const ids = batch.map((c) => contactByGhl.get(c.id)).filter(Boolean) as string[];
  for (const part of chunks(ids, CHUNK)) {
    const { error } = await db.from("contact_assignments").delete().in("contact_id", part);
    if (error) throw new Error(`assignments delete failed: ${error.message}`);
  }
  for (const part of chunks(assignments, CHUNK)) {
    const { error } = await db.from("contact_assignments").insert(part);
    if (error) throw new Error(`assignments insert failed: ${error.message}`);
  }
}

async function upsertOppBatch(locationId: string, batch: GhlOpportunity[]) {
  const db = supabaseAdmin();
  const rows = batch.map((o) => ({
    ghl_opportunity_id: o.id,
    ghl_location_id: locationId,
    ghl_contact_id: o.contactId ?? o.contact?.id ?? null,
    status: (o.status || "").toLowerCase() || null,
    monetary_value_cents: Math.round((o.monetaryValue ?? 0) * 100),
    updated_at: new Date().toISOString(),
  }));
  for (const part of chunks(rows, CHUNK)) {
    const { error } = await db.from("ghl_opportunities").upsert(part, { onConflict: "ghl_opportunity_id" });
    if (error) throw new Error(`opportunities upsert failed: ${error.message}`);
  }
  const contactIds = [...new Set(rows.map((r) => r.ghl_contact_id).filter(Boolean) as string[])];
  for (const part of chunks(contactIds, CHUNK)) {
    const { error } = await db.rpc("apply_opp_aggregates", { p_contact_ids: part });
    if (error) throw new Error(`aggregate apply failed: ${error.message}`);
  }
}

// Run one bounded slice of the sync for a location. budgetMs caps how
// long we keep fetching pages before persisting the cursor and returning.
export async function runSyncSlice(locationId: string, budgetMs = 35_000): Promise<SliceResult> {
  const started = Date.now();
  const state = await loadState(locationId);
  let pages = 0;

  // A finished pass rests before restarting so we don't hammer the API.
  //
  // Unless it finished short. A pass that reports `done` having walked well
  // under meta.total did not finish, it stopped, and resting on that for the
  // full window treats a truncated mirror as a healthy one — which is exactly
  // how #76 stayed invisible for ten days. A short pass restarts immediately.
  //
  // This also contains a stale deployment sharing this sync_state row: an old
  // build with the pre-#76 pagination will end the contacts phase early, and
  // the next slice from a current build now repairs that within minutes
  // instead of inheriting it for a full rest window.
  if (state.phase === "done") {
    const doneAt = state.completed_at ? new Date(state.completed_at).getTime() : 0;
    const total = state.contacts_total ?? 0;
    const finishedShort = total > 0 && state.contacts_synced < Math.floor(total * 0.98);
    if (!finishedShort && Date.now() - doneAt < REST_MINUTES * 60_000) {
      return {
        locationId, phase: "done", pagesProcessed: 0, passCompleted: false,
        contactsSynced: state.contacts_synced, contactsTotal: state.contacts_total,
        oppsSynced: state.opps_synced, oppsTotal: state.opps_total,
        skipped: `resting until ${new Date(doneAt + REST_MINUTES * 60_000).toISOString()}`,
      };
    }
    state.phase = "contacts";
    state.contact_cursor = null;
    state.opp_cursor = null;
    state.opp_page = 1;
    state.contacts_synced = 0;
    state.opps_synced = 0;
    state.pass_started_at = new Date().toISOString();
    await saveState({
      location_id: locationId, phase: "contacts", contact_cursor: null, opp_cursor: null, opp_page: 1,
      contacts_synced: 0, opps_synced: 0, pass_started_at: state.pass_started_at, completed_at: null, last_error: null,
    });
  }
  if (!state.pass_started_at) {
    state.pass_started_at = new Date().toISOString();
    await saveState({ location_id: locationId, pass_started_at: state.pass_started_at });
  }

  try {
    while (Date.now() - started < budgetMs) {
      if (state.phase === "contacts") {
        const params = new URLSearchParams({ locationId, limit: String(PAGE) });
        const cur = state.contact_cursor ?? {};
        if (cur.startAfterId) params.set("startAfterId", cur.startAfterId);
        if (cur.startAfter) params.set("startAfter", String(cur.startAfter));
        const data = await ghlFetch(locationId, `/contacts/?${params.toString()}`);
        const batch: (GhlContact & { dateAdded?: string })[] = data.contacts ?? [];
        if (data.meta?.total != null) state.contacts_total = data.meta.total;
        if (batch.length) await upsertContactBatch(locationId, batch);
        state.contacts_synced += batch.length;
        pages++;
        // A short page is NOT end-of-data. GHL returns fewer than `limit`
        // mid-stream, and it keeps handing back a non-null meta.nextPageUrl
        // even on the final page (verified: a 1-of-1 response still carries
        // one). The only signal that the walk is finished is an empty page.
        //
        // Ending on `batch.length < PAGE` is what froze this mirror: the walk
        // is ascending by dateAdded, so it quit at the same watermark every
        // pass and the newest contacts were never reachable. Advance on the
        // meta cursor, exactly as the opportunities branch below already does.
        if (batch.length === 0) {
          state.phase = "opportunities";
          state.opp_cursor = null;
          state.opp_page = 1;
        } else {
          const meta = data.meta ?? {};
          const last = batch[batch.length - 1];
          const nextId =
            meta.startAfterId != null ? String(meta.startAfterId) : last.id;
          const nextAfter =
            meta.startAfter != null
              ? Number(meta.startAfter)
              : last.dateAdded
                ? new Date(last.dateAdded).getTime()
                : undefined;

          // If the cursor does not move we would spin on the same page
          // forever. Stop and record it rather than reporting a clean pass.
          if (
            cur.startAfterId === nextId &&
            cur.startAfter === nextAfter
          ) {
            throw new Error(
              `contacts pagination did not advance at ${state.contacts_synced}/${state.contacts_total ?? "?"} (cursor stuck on ${nextId})`,
            );
          }
          state.contact_cursor = { startAfterId: nextId, startAfter: nextAfter };
        }
        await saveState({
          location_id: locationId, phase: state.phase, contact_cursor: state.contact_cursor,
          contacts_synced: state.contacts_synced, contacts_total: state.contacts_total,
          opp_cursor: state.opp_cursor, opp_page: state.opp_page,
          last_error: null,
        });
      } else if (state.phase === "opportunities") {
        // GHL caps page-number pagination at page 100 (SEARCH_USE_START_AFTER_
        // PAGINATION beyond 10k results); the response meta hands back the
        // startAfter/startAfterId cursor for the next request, so use that.
        const params = new URLSearchParams({ location_id: locationId, limit: String(PAGE) });
        const ocur = state.opp_cursor ?? {};
        if (ocur.startAfterId) params.set("startAfterId", ocur.startAfterId);
        if (ocur.startAfter) params.set("startAfter", String(ocur.startAfter));
        const data = await ghlFetch(locationId, `/opportunities/search?${params.toString()}`);
        const batch: GhlOpportunity[] = data.opportunities ?? [];
        if (data.meta?.total != null) state.opps_total = data.meta.total;
        if (batch.length) await upsertOppBatch(locationId, batch);
        state.opps_synced += batch.length;
        pages++;
        if (batch.length < PAGE) {
          state.phase = "done";
          state.completed_at = new Date().toISOString();
        } else if (data.meta?.startAfterId) {
          state.opp_cursor = { startAfterId: data.meta.startAfterId, startAfter: data.meta.startAfter };
        } else {
          // No cursor in the response and a full page — cannot advance safely.
          state.phase = "done";
          state.completed_at = new Date().toISOString();
        }
        await saveState({
          location_id: locationId, phase: state.phase, opp_cursor: state.opp_cursor,
          opps_synced: state.opps_synced, opps_total: state.opps_total,
          completed_at: state.completed_at, last_error: null,
        });
        if (state.phase === "done") break;
      } else {
        break;
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await saveState({ location_id: locationId, last_error: message });
    throw e;
  }

  return {
    locationId,
    phase: state.phase,
    contactsSynced: state.contacts_synced,
    contactsTotal: state.contacts_total,
    oppsSynced: state.opps_synced,
    oppsTotal: state.opps_total,
    pagesProcessed: pages,
    passCompleted: state.phase === "done",
  };
}
