// Supabase client. Reads from existing intelligence tables (events, leads,
// listings, scoring_log) and writes ONLY into new sidecar tables
// (video_jobs, video_events). Existing tables are NEVER mutated.

function sbHeaders(env, prefer = "") {
  const key = env.SUPABASE_KEY;
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

export async function getRecentEvents(env, contactId, limit = 25) {
  const url = sbUrl(env,
    `/rest/v1/events?contact_id=eq.${encodeURIComponent(contactId)}` +
    `&order=created_at.desc&limit=${limit}`);
  const r = await fetch(url, { headers: sbHeaders(env) });
  if (!r.ok) return [];
  return r.json();
}

export async function getLead(env, contactId) {
  const url = sbUrl(env, `/rest/v1/leads?contact_id=eq.${encodeURIComponent(contactId)}&limit=1`);
  const r = await fetch(url, { headers: sbHeaders(env) });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows[0] || null;
}

export async function getListing(env, listingId) {
  const url = sbUrl(env, `/rest/v1/listings?id=eq.${encodeURIComponent(listingId)}&limit=1`);
  const r = await fetch(url, { headers: sbHeaders(env) });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows[0] || null;
}

export async function getScoringLog(env, contactId, limit = 10) {
  const url = sbUrl(env,
    `/rest/v1/scoring_log?contact_id=eq.${encodeURIComponent(contactId)}` +
    `&order=created_at.desc&limit=${limit}`);
  const r = await fetch(url, { headers: sbHeaders(env) });
  if (!r.ok) return [];
  return r.json();
}

// ── WRITE helpers (sidecar-owned tables only) ─────────────────────────────

export async function insertVideoJob(env, row) {
  const r = await fetch(sbUrl(env, `/rest/v1/video_jobs`), {
    method: "POST",
    headers: sbHeaders(env, "return=representation"),
    body: JSON.stringify(row),
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
    }
  );
  if (!r.ok) throw new Error(`claimJobForProcessing failed: ${r.status} ${await r.text()}`);
  const rows = await r.json();
  return rows[0] || null;
}

export async function getVideoJob(env, jobId) {
  const r = await fetch(
    sbUrl(env, `/rest/v1/video_jobs?id=eq.${encodeURIComponent(jobId)}&limit=1`),
    { headers: sbHeaders(env) }
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
  const r = await fetch(url, { headers: sbHeaders(env) });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows[0] || null;
}

export async function insertVideoEvent(env, row) {
  const r = await fetch(sbUrl(env, `/rest/v1/video_events`), {
    method: "POST",
    headers: sbHeaders(env),
    body: JSON.stringify(row),
  });
  if (!r.ok) {
    // Best-effort. Tracking should never break delivery.
    console.warn("insertVideoEvent failed:", r.status);
  }
}
