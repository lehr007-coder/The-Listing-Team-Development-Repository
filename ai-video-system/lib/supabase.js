// Supabase client — READ-ONLY access to the Ylopo intelligence tables
// (leads, events, listings, scoring_log). These are owned by another system
// and are NEVER mutated here.
//
// The sidecar tables this worker owns (video_jobs, video_events) moved to
// Cloudflare D1 on 2026-09-18; see lib/d1.js. Nothing in this file writes.

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

// ── sidecar tables have MOVED ────────────────────────────────────────────
//
// video_jobs and video_events left Supabase for Cloudflare D1 on 2026-09-18.
// Everything that reads or writes job state now lives in lib/d1.js. This
// module is READ-ONLY intelligence access and must stay that way.
//
// Why the split: video_jobs/video_events are owned by ai-video-system, so
// they could move. leads/events/listings/scoring_log are owned by the Ylopo
// intelligence system and are written by other services — they cannot be
// migrated unilaterally.
//
// Do NOT add a write helper here. If you need job state, import it from
// ./d1.js.
