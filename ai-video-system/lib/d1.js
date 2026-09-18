// D1 store for the sidecar tables ai-video-system OWNS: video_jobs and
// video_events. Ported off Supabase/PostgREST 2026-09-18.
//
// The intelligence tables (leads, events, listings, scoring_log) are owned by
// another system and are NOT here — they stay on Supabase, read-only, in
// lib/supabase.js. This module is the only writer of job state.
//
// Two translation rules matter for callers:
//
//  1. JSON round-tripping. SQLite has no jsonb and no text[], so those columns
//     are TEXT holding JSON. Rows are serialized on the way in and parsed on
//     the way out, so callers keep passing and receiving real objects and
//     arrays exactly as they did with PostgREST. An array column that is NULL
//     or unparseable comes back [] (never null) because callers .map/.join it.
//
//  2. Timestamps are ISO-8601 UTC strings, so lexical comparison equals
//     chronological comparison and `ORDER BY created_at DESC` keeps its
//     meaning. created_at is supplied here, not by a DB default.

const JSON_OBJECT_COLUMNS = [
  "listing_data", "market_data", "script_meta",
  "scene_plan", "social_copy", "delivery_results",
];

const JSON_ARRAY_COLUMNS = ["delivery_channels", "social_targets"];

// Whitelist. Every write filters the caller's patch through this, so an
// unexpected key can never reach the SQL string — the column list is the
// only thing interpolated, values are always bound.
const JOB_COLUMNS = new Set([
  "id", "contact_id", "video_type", "render_engine", "distribution", "status",
  "trigger_reason", "priority_score", "delivery_channels", "social_targets",
  "scheduled_post_at", "listing_id", "listing_data", "market_data", "script",
  "script_meta", "scene_plan", "social_copy", "heygen_video_id", "fcpxml_job_id",
  "r2_key", "r2_url", "stream_uid", "stream_hls", "stream_dash", "hosted_url",
  "gif_url", "thumbnail_url", "cta_url", "aspect", "delivery_results",
  "engagement_score", "last_event", "last_event_at", "created_at",
  "rendered_at", "delivered_at", "failed_at", "error",
]);

const EVENT_COLUMNS = new Set([
  "id", "job_id", "contact_id", "event", "meta", "created_at",
]);

function db(env) {
  if (!env.VIDEO_DB) throw new Error("VIDEO_DB binding missing");
  return env.VIDEO_DB;
}

// ── row (de)serialization ────────────────────────────────────────────────

function encodeRow(row, allowed) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (!allowed.has(k)) continue;
    if (v === undefined) continue;
    if (JSON_OBJECT_COLUMNS.includes(k) || JSON_ARRAY_COLUMNS.includes(k) || k === "meta") {
      out[k] = v === null ? null : JSON.stringify(v);
    } else if (typeof v === "boolean") {
      out[k] = v ? 1 : 0;
    } else {
      out[k] = v;
    }
  }
  return out;
}

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed === null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

export function decodeRow(row) {
  if (!row) return null;
  const out = { ...row };
  for (const k of JSON_OBJECT_COLUMNS) {
    if (k in out) out[k] = parseJson(out[k], null);
  }
  // Arrays default to [] rather than null: callers join/map these directly.
  for (const k of JSON_ARRAY_COLUMNS) {
    if (k in out) {
      const v = parseJson(out[k], []);
      out[k] = Array.isArray(v) ? v : [];
    }
  }
  if ("meta" in out) out.meta = parseJson(out.meta, {});
  return out;
}

function decodeRows(rows) {
  return (rows || []).map(decodeRow);
}

// ── writes ───────────────────────────────────────────────────────────────

export async function insertVideoJob(env, row) {
  const data = encodeRow(
    { created_at: new Date().toISOString(), ...row },
    JOB_COLUMNS
  );
  const cols = Object.keys(data);
  if (!cols.length) throw new Error("insertVideoJob: no writable columns");
  const sql =
    `INSERT INTO video_jobs (${cols.join(", ")}) ` +
    `VALUES (${cols.map(() => "?").join(", ")}) RETURNING *`;
  const out = await db(env).prepare(sql).bind(...cols.map((c) => data[c])).first();
  if (!out) throw new Error("insertVideoJob failed: no row returned");
  return decodeRow(out);
}

export async function updateVideoJob(env, jobId, patch) {
  const data = encodeRow(patch, JOB_COLUMNS);
  const cols = Object.keys(data).filter((c) => c !== "id");
  if (!cols.length) return getVideoJob(env, jobId);
  const sql =
    `UPDATE video_jobs SET ${cols.map((c) => `${c} = ?`).join(", ")} ` +
    `WHERE id = ? RETURNING *`;
  const out = await db(env)
    .prepare(sql)
    .bind(...cols.map((c) => data[c]), jobId)
    .first();
  return decodeRow(out);
}

// Atomic "claim this state transition". The UPDATE only matches rows whose
// status is NOT already in `fromNotIn`, so concurrent callers serialize on
// the row: the first to flip it gets the row back via RETURNING, the rest
// match zero rows and get null.
//
// This was previously a PostgREST PATCH relying on Postgres row-level
// locking. A single SQLite UPDATE ... WHERE ... RETURNING gives the same
// guarantee — the statement is atomic, so the predicate is evaluated and the
// write applied without another writer interleaving. D1 serializes writes to
// a database, which makes this strictly safer than the Postgres original.
// Do NOT reimplement as SELECT-then-UPDATE: that reintroduces the race this
// exists to close (a real HeyGen webhook and the cron poll-fallback arriving
// in the same instant, both dispatching delivery).
export async function claimVideoJobTransition(env, jobId, patch, fromNotIn) {
  const data = encodeRow(patch, JOB_COLUMNS);
  const cols = Object.keys(data).filter((c) => c !== "id");
  if (!cols.length) throw new Error("claimVideoJobTransition: empty patch");
  const placeholders = fromNotIn.map(() => "?").join(", ");
  const sql =
    `UPDATE video_jobs SET ${cols.map((c) => `${c} = ?`).join(", ")} ` +
    `WHERE id = ? AND status NOT IN (${placeholders}) RETURNING *`;
  const out = await db(env)
    .prepare(sql)
    .bind(...cols.map((c) => data[c]), jobId, ...fromNotIn)
    .first();
  return decodeRow(out);
}

// Atomic claim of the processing lock. Eligible when:
//   1. last_event IS NULL              — fresh job, never processed
//   2. last_event != 'processing'      — completed or previously failed
//   3. last_event = 'processing' AND last_event_at < now()-STALE_CLAIM_MINUTES
//      — stale claim (worker likely killed by Cloudflare wall-clock mid-run);
//        treat as released so the job recovers instead of staying stuck.
//
// Returns the row on win, null on lose. This is the lock preventing two
// parallel processOne invocations from both running R2 + Stream + GHL.
//
// Note on case 3: last_event_at is an ISO-8601 UTC string, so the string
// comparison below is a valid chronological comparison. A row whose
// last_event is 'processing' with a NULL last_event_at is deliberately NOT
// claimable — an in-flight claim that never stamped a time should not be
// stolen on the basis of a missing value.
const STALE_CLAIM_MINUTES = 10;
export async function claimJobForProcessing(env, jobId) {
  const staleAt = new Date(Date.now() - STALE_CLAIM_MINUTES * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  const sql =
    `UPDATE video_jobs SET last_event = 'processing', last_event_at = ? ` +
    `WHERE id = ? AND (` +
    `  last_event IS NULL` +
    `  OR last_event != 'processing'` +
    `  OR (last_event = 'processing' AND last_event_at IS NOT NULL AND last_event_at < ?)` +
    `) RETURNING *`;
  const out = await db(env).prepare(sql).bind(now, jobId, staleAt).first();
  return decodeRow(out);
}

// Best-effort. Tracking must never break delivery, so this swallows errors
// exactly as the PostgREST version did.
export async function insertVideoEvent(env, row) {
  try {
    const data = encodeRow(
      { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row },
      EVENT_COLUMNS
    );
    const cols = Object.keys(data);
    const sql =
      `INSERT INTO video_events (${cols.join(", ")}) ` +
      `VALUES (${cols.map(() => "?").join(", ")})`;
    await db(env).prepare(sql).bind(...cols.map((c) => data[c])).run();
  } catch (err) {
    console.warn("insertVideoEvent failed:", err?.message || err);
  }
}

// ── reads ────────────────────────────────────────────────────────────────

export async function getVideoJob(env, jobId) {
  const out = await db(env)
    .prepare(`SELECT * FROM video_jobs WHERE id = ? LIMIT 1`)
    .bind(jobId)
    .first();
  return decodeRow(out);
}

export async function findActiveJobForContact(env, contactId, videoType) {
  const out = await db(env)
    .prepare(
      `SELECT * FROM video_jobs
        WHERE contact_id = ? AND video_type = ?
          AND status IN ('queued','rendering','delivering')
        ORDER BY created_at DESC LIMIT 1`
    )
    .bind(contactId, videoType)
    .first();
  return decodeRow(out);
}

export async function listVideoEvents(env, jobId, limit = 200) {
  const { results } = await db(env)
    .prepare(
      `SELECT * FROM video_events WHERE job_id = ?
        ORDER BY created_at DESC LIMIT ?`
    )
    .bind(jobId, Math.min(limit, 1000))
    .all();
  return decodeRows(results);
}

// Sum engagement_score across all delivered jobs for one contact. The
// PostgREST version fetched every row and reduced in JS; SQL does the sum.
export async function getContactEngagementTotal(env, contactId) {
  const out = await db(env)
    .prepare(
      `SELECT COALESCE(SUM(engagement_score), 0) AS total
         FROM video_jobs WHERE contact_id = ? AND status = 'delivered'`
    )
    .bind(contactId)
    .first();
  return Number(out?.total) || 0;
}

// [{contact_id, total}] across all delivered jobs, capped at `limit` UNIQUE
// contacts and sorted by total desc.
//
// The cap must apply to grouped contacts, never to raw rows: limiting rows
// silently truncated high-volume contacts and understated their scores. That
// bug is why the PostgREST version pulled every row and grouped in JS. Here
// GROUP BY does it in SQL, so LIMIT applies to contacts by construction.
export async function listDeliveredEngagementByContact(env, { limit = 200 } = {}) {
  const cap = Math.min(limit, 2000);
  const { results } = await db(env)
    .prepare(
      `SELECT contact_id, COALESCE(SUM(engagement_score), 0) AS total
         FROM video_jobs
        WHERE status = 'delivered' AND contact_id IS NOT NULL
        GROUP BY contact_id
        ORDER BY total DESC
        LIMIT ?`
    )
    .bind(cap)
    .all();
  return (results || []).map((r) => ({
    contact_id: r.contact_id,
    total: Number(r.total) || 0,
  }));
}

// ── list queries ─────────────────────────────────────────────────────────
//
// These replace the raw PostgREST URLs that lib/alerts.js, lib/analytics.js,
// lib/heygen-poll-fallback.js and routes/admin.js used to build by hand.
// Every filter value is bound, never interpolated. `order` is whitelisted
// rather than passed through, so a caller can't inject via sort direction.

function dir(order) {
  return String(order).toLowerCase() === "asc" ? "ASC" : "DESC";
}

// Flexible job list. Covers the admin job browser, the analytics window,
// the daily summary, top-contacts and per-contact history.
export async function listJobs(env, {
  contactId = null,
  status = null,
  renderEngine = null,
  since = null,
  contactNotNull = false,
  order = "desc",
  limit = 100,
} = {}) {
  const where = [];
  const binds = [];
  if (contactId)     { where.push("contact_id = ?");    binds.push(contactId); }
  if (status)        { where.push("status = ?");        binds.push(status); }
  if (renderEngine)  { where.push("render_engine = ?"); binds.push(renderEngine); }
  if (since)         { where.push("created_at >= ?");   binds.push(since); }
  if (contactNotNull) where.push("contact_id IS NOT NULL");

  const sql =
    `SELECT * FROM video_jobs` +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    ` ORDER BY created_at ${dir(order)} LIMIT ?`;
  const { results } = await db(env)
    .prepare(sql)
    .bind(...binds, Math.min(limit, 5000))
    .all();
  return decodeRows(results);
}

export async function listJobEvents(env, jobId, { order = "asc", limit = 200 } = {}) {
  const { results } = await db(env)
    .prepare(
      `SELECT * FROM video_events WHERE job_id = ?
        ORDER BY created_at ${dir(order)} LIMIT ?`
    )
    .bind(jobId, Math.min(limit, 5000))
    .all();
  return decodeRows(results);
}

export async function listEventsSince(env, since, limit = 5000) {
  const { results } = await db(env)
    .prepare(
      `SELECT * FROM video_events WHERE created_at >= ?
        ORDER BY created_at DESC LIMIT ?`
    )
    .bind(since, Math.min(limit, 5000))
    .all();
  return decodeRows(results);
}

// Jobs sitting in rendering/rendered longer than the cutoff — the stuck-job
// alert scan.
export async function listStuckJobs(env, cutoff, limit = 200) {
  const { results } = await db(env)
    .prepare(
      `SELECT * FROM video_jobs
        WHERE status IN ('rendering','rendered') AND created_at < ?
        ORDER BY created_at ASC LIMIT ?`
    )
    .bind(cutoff, Math.min(limit, 1000))
    .all();
  return decodeRows(results);
}

// Rendered-but-never-delivered jobs inside an age window, for orphan cleanup.
export async function listOrphanCandidates(env, { upper, lower, limit = 50 }) {
  const { results } = await db(env)
    .prepare(
      `SELECT * FROM video_jobs
        WHERE status = 'rendered' AND created_at < ? AND created_at > ?
        ORDER BY created_at ASC LIMIT ?`
    )
    .bind(upper, lower, Math.min(limit, 200))
    .all();
  return decodeRows(results);
}

// Bulk-mark a set of ids failed, but ONLY rows still in 'rendered'. The
// status guard is what made the PostgREST version safe against a job that
// completed delivery between the list and the update; it is preserved here.
// Returns the number of rows actually changed.
export async function markJobsFailed(env, ids, { failedAt, error: errMsg }) {
  if (!ids?.length) return 0;
  const CHUNK = 50;
  let updated = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const sql =
      `UPDATE video_jobs SET status = 'failed', failed_at = ?, error = ? ` +
      `WHERE status = 'rendered' AND id IN (${slice.map(() => "?").join(", ")})`;
    const res = await db(env).prepare(sql).bind(failedAt, errMsg, ...slice).run();
    updated += res?.meta?.changes ?? 0;
  }
  return updated;
}

// HeyGen poll-fallback scan: jobs stuck in 'rendering' with a HeyGen id,
// inside the age window.
export async function listPollFallbackJobs(env, { minAge, maxAge, limit = 25 }) {
  const { results } = await db(env)
    .prepare(
      `SELECT * FROM video_jobs
        WHERE status = 'rendering'
          AND render_engine = 'HEYGEN'
          AND heygen_video_id IS NOT NULL
          AND created_at < ? AND created_at > ?
        ORDER BY created_at ASC LIMIT ?`
    )
    .bind(minAge, maxAge, Math.min(limit, 200))
    .all();
  return decodeRows(results);
}

// {status: count} across the whole table. Replaces pulling 1000 status rows
// and tallying them in JS.
export async function countJobsByStatus(env) {
  const { results } = await db(env)
    .prepare(`SELECT status, COUNT(*) AS n FROM video_jobs GROUP BY status`)
    .all();
  const out = {};
  for (const r of results || []) out[r.status] = Number(r.n) || 0;
  return out;
}

// Row counts, used by the migration verifier and health checks.
export async function tableCounts(env) {
  const jobs = await db(env).prepare(`SELECT COUNT(*) AS n FROM video_jobs`).first();
  const events = await db(env).prepare(`SELECT COUNT(*) AS n FROM video_events`).first();
  return { video_jobs: Number(jobs?.n) || 0, video_events: Number(events?.n) || 0 };
}
