// Supabase client. Reads from existing intelligence tables (events, leads,
// listings, scoring_log) and writes ONLY into new sidecar tables
// (video_jobs, video_events). Existing tables are NEVER mutated.

// Cap every Supabase fetch so a slow PostgREST response can't burn the
// queue consumer's 15-min wall-clock budget. We've hit this exact
// failure mode before — workers hung in updateVideoJob mid-pipeline
// with no catch-block error because PostgREST silently stalled. Closes
// the last unbounded-fetch hole in the worker (R2/Stream/CF Images/
// GHL/HeyGen/Anthropic are all already bounded).
const SB_TIMEOUT_MS = 30_000;
const sbSignal = () => AbortSignal.timeout(SB_TIMEOUT_MS);

function sbFetch(env, path, init = {}) {
  return fetch(sbUrl(env, path), { ...init, signal: sbSignal() });
}

function sbHeaders(env, prefer = "") {
  // RLS is disabled on video_jobs / video_events (sidecar-only tables
  // gated by PROXY_API_KEY at the worker layer), so the standard
  // SUPABASE_KEY is sufficient and avoids 401s from any stale or
  // mis-pasted service-role secret. We still fall through to
  // SUPABASE_SERVICE_ROLE_KEY if SUPABASE_KEY isn't set.
  const key = env.SUPABASE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const h = {
    "apikey": key,
    "Authorization": `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  if (prefer) h["Prefer"] = prefer;
  return h;
}

function sbUrl(env, path) {
  return `${env.SUPABASE_URL}${path}`;
}

// ── READ helpers (existing intelligence) ───────────────────────────────────
//
// The Ylopo intelligence schema uses leads.id (uuid) as the primary key
// and stores the GHL contact id under leads.ghl_contact_id (text). The
// events and scoring_log tables FK back via lead_id (uuid). Our worker
// only knows the GHL contact id, so every read against events/leads/
// scoring_log resolves through leads.ghl_contact_id → leads.id first.

export async function resolveLeadByGhlContactId(env, ghlContactId) {
  const url = sbUrl(env,
    `/rest/v1/leads?ghl_contact_id=eq.${encodeURIComponent(ghlContactId)}&limit=1`);
  const r = await fetch(url, { headers: sbHeaders(env), signal: sbSignal() });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows[0] || null;
}

export async function getLead(env, contactId) {
  return resolveLeadByGhlContactId(env, contactId);
}

export async function getRecentEvents(env, contactId, limit = 25) {
  const lead = await resolveLeadByGhlContactId(env, contactId);
  if (!lead?.id) return [];
  const url = sbUrl(env,
    `/rest/v1/events?lead_id=eq.${encodeURIComponent(lead.id)}` +
    `&order=created_at.desc&limit=${limit}`);
  const r = await fetch(url, { headers: sbHeaders(env), signal: sbSignal() });
  if (!r.ok) return [];
  return r.json();
}

export async function getScoringLog(env, contactId, limit = 10) {
  const lead = await resolveLeadByGhlContactId(env, contactId);
  if (!lead?.id) return [];
  const url = sbUrl(env,
    `/rest/v1/scoring_log?lead_id=eq.${encodeURIComponent(lead.id)}` +
    `&order=created_at.desc&limit=${limit}`);
  const r = await fetch(url, { headers: sbHeaders(env), signal: sbSignal() });
  if (!r.ok) return [];
  return r.json();
}

export async function getListing(env, listingId) {
  const url = sbUrl(env, `/rest/v1/listings?id=eq.${encodeURIComponent(listingId)}&limit=1`);
  const r = await fetch(url, { headers: sbHeaders(env), signal: sbSignal() });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows[0] || null;
}

// ── WRITE helpers (sidecar-owned tables only) ─────────────────────────────

export async function insertVideoJob(env, row) {
  const r = await fetch(sbUrl(env, `/rest/v1/video_jobs`), {
    method: "POST",
    headers: sbHeaders(env, "return=representation"),
    body: JSON.stringify(row),
    signal: sbSignal(),
  });
  if (!r.ok) throw new Error(`insertVideoJob failed: ${r.status} ${await r.text()}`);
  const rows = await r.json();
  return rows[0];
}

export async function updateVideoJob(env, jobId, patch) {
  const r = await fetch(
    sbUrl(env, `/rest/v1/video_jobs?id=eq.${encodeURIComponent(jobId)}`),
    {
      method: "PATCH",
      headers: sbHeaders(env, "return=representation"),
      body: JSON.stringify(patch),
      signal: sbSignal(),
    }
  );
  if (!r.ok) throw new Error(`updateVideoJob failed: ${r.status} ${await r.text()}`);
  const rows = await r.json();
  return rows[0] || null;
}

// Atomic claim: try to mark the job as "being processed" by setting
// last_event='processing'. Concurrent claim attempts on the same row
// serialize at the Postgres row level — first wins, the rest get 0
// rows back.
//
// Filter union of three states that are eligible for claim:
//   1. last_event IS NULL                — fresh job, never processed
//   2. last_event != 'processing'        — completed or previously failed
//   3. last_event='processing' AND
//      last_event_at < now()-STALE_MIN   — stale claim (worker likely killed
//                                          by Cloudflare wall-clock mid-run);
//                                          treat as released so the job can
//                                          recover instead of staying stuck
//
// Returns the row on win, null on lose.
//
// This is the lock that prevents two parallel processOne invocations
// (real HeyGen callback + cron poll-fallback racing in the same minute)
// from both running R2 + Stream + GHL in parallel.
const STALE_CLAIM_MINUTES = 10;
export async function claimJobForProcessing(env, jobId) {
  const staleAt = new Date(Date.now() - STALE_CLAIM_MINUTES * 60 * 1000).toISOString();
  const filter =
    `id=eq.${encodeURIComponent(jobId)}` +
    `&or=(last_event.is.null,` +
        `last_event.neq.processing,` +
        `and(last_event.eq.processing,last_event_at.lt.${encodeURIComponent(staleAt)}))`;
  const r = await fetch(
    sbUrl(env, `/rest/v1/video_jobs?${filter}`),
    {
      method: "PATCH",
      headers: sbHeaders(env, "return=representation"),
      body: JSON.stringify({ last_event: "processing", last_event_at: new Date().toISOString() }),
      signal: sbSignal(),
    }
  );
  if (!r.ok) throw new Error(`claimJobForProcessing failed: ${r.status} ${await r.text()}`);
  const rows = await r.json();
  return rows[0] || null;
}

export async function getVideoJob(env, jobId) {
  const r = await fetch(
    sbUrl(env, `/rest/v1/video_jobs?id=eq.${encodeURIComponent(jobId)}&limit=1`),
    { headers: sbHeaders(env), signal: sbSignal() }
  );
  if (!r.ok) return null;
  const rows = await r.json();
  return rows[0] || null;
}

export async function findActiveJobForContact(env, contactId, videoType) {
  const url = sbUrl(env,
    `/rest/v1/video_jobs?contact_id=eq.${encodeURIComponent(contactId)}` +
    `&video_type=eq.${encodeURIComponent(videoType)}` +
    `&status=in.(queued,rendering,delivering)&order=created_at.desc&limit=1`);
  const r = await fetch(url, { headers: sbHeaders(env), signal: sbSignal() });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows[0] || null;
}

export async function insertVideoEvent(env, row) {
  const r = await fetch(sbUrl(env, `/rest/v1/video_events`), {
    method: "POST",
    headers: sbHeaders(env),
    body: JSON.stringify(row),
    signal: sbSignal(),
  });
  if (!r.ok) {
    // Best-effort. Tracking should never break delivery.
    console.warn("insertVideoEvent failed:", r.status);
  }
}

// Sum engagement_score across all delivered jobs for a single contact.
// Used by tracking.js to write the cumulative (cross-video) score to GHL
// instead of only the per-job score.
export async function getContactEngagementTotal(env, contactId) {
  const url = sbUrl(env,
    `/rest/v1/video_jobs?contact_id=eq.${encodeURIComponent(contactId)}` +
    `&status=eq.delivered&select=engagement_score`);
  const r = await fetch(url, { headers: sbHeaders(env), signal: sbSignal() });
  if (!r.ok) return 0;
  const rows = await r.json();
  return rows.reduce((sum, j) => sum + (Number(j.engagement_score) || 0), 0);
}

// Return [{contact_id, total}] grouped-and-summed across all delivered jobs,
// capped at `limit` unique contacts (sorted by total desc so the highest
// scorers get synced first when the batch is truncated). Used by the
// POST /v1/admin/contacts/sync-scores bulk-resync endpoint.
export async function listDeliveredEngagementByContact(env, { limit = 200 } = {}) {
  const cap = Math.min(limit, 2000);
  // Fetch all rows without a row-level LIMIT so the JS grouping sees every
  // delivered job. Applying LIMIT to raw rows (not contacts) caused high-volume
  // contacts to be silently truncated and receive understated scores.
  // The cap is applied after grouping so it correctly limits unique contacts.
  const url = sbUrl(env,
    `/rest/v1/video_jobs?status=eq.delivered` +
    `&contact_id=not.is.null` +
    `&select=contact_id,engagement_score`);
  const r = await fetch(url, { headers: sbHeaders(env), signal: sbSignal() });
  if (!r.ok) return [];
  const rows = await r.json();

  const map = new Map();
  for (const row of rows) {
    const cid = row.contact_id;
    if (!cid) continue;
    map.set(cid, (map.get(cid) || 0) + (Number(row.engagement_score) || 0));
  }
  return [...map.entries()]
    .map(([contact_id, total]) => ({ contact_id, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, cap);
}
