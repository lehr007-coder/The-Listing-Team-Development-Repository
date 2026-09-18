import { supabaseAdmin } from "@/lib/supabase/server";
import { refreshLocation } from "@/lib/ghl/oauth";

const BASE = "https://services.leadconnectorhq.com";
const VERSION = "2021-07-28";

async function getAccessToken(locationId: string): Promise<string> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("ghl_oauth_tokens")
    .select("access_token, expires_at")
    .eq("location_id", locationId)
    .single();
  if (!data) throw new Error(`No GHL install for location ${locationId}`);
  if (new Date(data.expires_at).getTime() <= Date.now()) {
    const t = await refreshLocation(locationId);
    return t.access_token;
  }
  return data.access_token;
}

export async function ghlFetch(locationId: string, path: string, init: RequestInit = {}) {
  const doFetch = async (token: string) =>
    fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`,
        Version: VERSION,
        Accept: "application/json",
      },
    });

  let token = await getAccessToken(locationId);
  let res = await doFetch(token);
  if (res.status === 401) {
    const refreshed = await refreshLocation(locationId);
    res = await doFetch(refreshed.access_token);
  }
  if (!res.ok) throw new Error(`GHL ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export type GhlContact = {
  id: string;
  firstName?: string;
  lastName?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  assignedTo?: string; // GHL user id
  customFields?: { id: string; value: unknown }[];
  tags?: string[];
};

export async function listContactsPaged(
  locationId: string,
  pageLimit = 100,
): Promise<GhlContact[]> {
  const out: GhlContact[] = [];
  let startAfterId: string | undefined;
  let startAfter: number | undefined;
  for (let i = 0; i < 50; i++) {
    const params = new URLSearchParams({ locationId, limit: String(pageLimit) });
    if (startAfterId) params.set("startAfterId", startAfterId);
    if (startAfter) params.set("startAfter", String(startAfter));
    const data = await ghlFetch(locationId, `/contacts/?${params.toString()}`);
    const batch: GhlContact[] = data.contacts ?? [];
    out.push(...batch);
    if (batch.length < pageLimit) break;
    const last = batch[batch.length - 1] as GhlContact & { dateAdded?: number };
    startAfterId = last.id;
    startAfter = last.dateAdded ? new Date(last.dateAdded).getTime() : undefined;
  }
  return out;
}

export type GhlOpportunity = {
  id: string;
  name?: string;
  status: string; // "open" | "won" | "lost" | "abandoned"
  monetaryValue?: number; // dollars
  contactId?: string;
  contact?: { id?: string };
};

// Page through /opportunities/search for a location. Requires the
// opportunities.readonly scope. GHL caps limit at 100 per page and
// supports simple page-number pagination on this endpoint.
export async function listOpportunitiesPaged(
  locationId: string,
  pageLimit = 100,
  maxPages = 50,
): Promise<GhlOpportunity[]> {
  const out: GhlOpportunity[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const params = new URLSearchParams({
      location_id: locationId,
      limit: String(pageLimit),
      page: String(page),
    });
    const data = await ghlFetch(locationId, `/opportunities/search?${params.toString()}`);
    const batch: GhlOpportunity[] = data.opportunities ?? [];
    out.push(...batch);
    if (batch.length < pageLimit) break;
  }
  return out;
}
