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
// serialize at the Postgres row level, the first wins, the rest get 0
// rows updated. The `or=(last_event.is.null, last_event.not.eq.processing)`
// guard handles fresh jobs (NULL last_event) plus retried-after-failure
// jobs (last_event=process_failed_at_X) — only an in-flight claim
// blocks. Returns the row on win, null on lose.
//
// This is the lock that prevents two parallel processOne invocations
// (real HeyGen callback + cron poll-fallback racing in the same minute)
// from both running R2 upload + Stream upload + GHL email send.
export async function claimJobForProcessing(env, jobId) {
  const r = await fetch(
    sbUrl(env,
      `/rest/v1/video_jobs?id=eq.${encodeURIComponent(jobId)}` +
      `&or=(last_event.is.null,last_event.not.eq.processing)`
    ),
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
