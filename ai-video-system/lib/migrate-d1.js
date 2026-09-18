// One-shot backfill: Supabase video_jobs/video_events -> Cloudflare D1.
//
// This runs INSIDE the Worker, where both the Supabase credentials and the
// D1 binding already live. Nothing is exported to a laptop, pasted into a
// terminal, or moved through a third party — the rows go straight across.
//
// Safe to re-run. Every write is INSERT OR REPLACE keyed on the primary key,
// so a partial run (Worker wall-clock limit, network blip) is fixed by simply
// calling it again. It never deletes and never writes to Supabase.
//
// Retire this file once production is cut over and verified.

const PAGE = 200;

function sbHeaders(env) {
  const key = env.SUPABASE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  return { apikey: key, Authorization: `Bearer ${key}` };
}

// PostgREST returns timestamptz as "2026-05-07T01:44:33.879+00:00".
// D1 stores ISO-8601 Z so that lexical ordering equals chronological
// ordering — the assumption every `ORDER BY created_at` and every
// `created_at < cutoff` comparison in this codebase now relies on.
function isoZ(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

const JOB_TS = ["scheduled_post_at", "last_event_at", "created_at",
                "rendered_at", "delivered_at", "failed_at"];
const JOB_JSON = ["listing_data", "market_data", "script_meta",
                  "scene_plan", "social_copy", "delivery_results"];
const JOB_ARR = ["delivery_channels", "social_targets"];

const JOB_COLS = [
  "id", "contact_id", "video_type", "render_engine", "distribution", "status",
  "trigger_reason", "priority_score", "delivery_channels", "social_targets",
  "scheduled_post_at", "listing_id", "listing_data", "market_data", "script",
  "script_meta", "scene_plan", "social_copy", "heygen_video_id", "fcpxml_job_id",
  "r2_key", "r2_url", "stream_uid", "stream_hls", "stream_dash", "hosted_url",
  "gif_url", "thumbnail_url", "cta_url", "aspect", "delivery_results",
  "engagement_score", "last_event", "last_event_at", "created_at",
  "rendered_at", "delivered_at", "failed_at", "error",
];

const EVENT_COLS = ["id", "job_id", "contact_id", "event", "meta", "created_at"];

function jobValues(row) {
  return JOB_COLS.map((c) => {
    const v = row[c];
    if (JOB_TS.includes(c)) return isoZ(v);
    if (JOB_ARR.includes(c)) return JSON.stringify(Array.isArray(v) ? v : []);
    if (JOB_JSON.includes(c)) return v == null ? null : JSON.stringify(v);
    if (v === undefined) return null;
    return v;
  });
}

function eventValues(row) {
  return [
    row.id,
    row.job_id,
    row.contact_id ?? null,
    row.event,
    row.meta == null ? "{}" : JSON.stringify(row.meta),
    isoZ(row.created_at),
  ];
}

async function fetchPage(env, table, offset, limit) {
  const url =
    `${env.SUPABASE_URL}/rest/v1/${table}?select=*` +
    `&order=created_at.asc&offset=${offset}&limit=${limit}`;
  const r = await fetch(url, {
    headers: sbHeaders(env),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`${table} read failed: ${r.status} ${await r.text()}`);
  return r.json();
}

export async function migrateSupabaseToD1(env, { dryRun = true, force = false } = {}) {
  if (!env.VIDEO_DB) return { ok: false, reason: "no_video_db_binding" };
  if (!env.SUPABASE_URL || !(env.SUPABASE_KEY || env.SUPABASE_SERVICE_ROLE_KEY)) {
    return { ok: false, reason: "no_supabase_config" };
  }

  // GUARD: refuse to run against a populated D1 unless explicitly forced.
  //
  // This is a one-shot cutover tool, but it is reachable forever — an admin
  // route and a KV flag. Supabase's video_jobs rows are FROZEN at the cutover
  // (nothing writes them any more; the newest is 2026-08-10). Every write here
  // is INSERT OR REPLACE, so re-running this months from now would silently
  // overwrite live job state with stale rows and resurrect deleted ones.
  //
  // Re-running against an EMPTY D1 is still allowed with no ceremony, which is
  // the case that matters: a genuine rollback or a fresh environment. Forcing
  // over live data has to be deliberate.
  if (!dryRun && !force) {
    const existing = await env.VIDEO_DB
      .prepare(`SELECT COUNT(*) AS n FROM video_jobs`).first();
    const n = Number(existing?.n) || 0;
    if (n > 0) {
      return {
        ok: false,
        reason: "d1_not_empty",
        existing_video_jobs: n,
        detail:
          "video_jobs already has rows. This tool is a one-shot cutover and " +
          "Supabase is frozen at the cutover date, so re-running would " +
          "overwrite live job state with stale rows. Pass force to override " +
          "only if you intend exactly that.",
      };
    }
  }

  const started = Date.now();
  const out = { ok: true, dry_run: dryRun, video_jobs: 0, video_events: 0, errors: [] };

  // video_jobs FIRST: video_events has a FK to it, so loading events against
  // an empty jobs table would fail every row.
  const jobSql =
    `INSERT OR REPLACE INTO video_jobs (${JOB_COLS.join(", ")}) ` +
    `VALUES (${JOB_COLS.map(() => "?").join(", ")})`;

  for (let offset = 0; ; offset += PAGE) {
    const rows = await fetchPage(env, "video_jobs", offset, PAGE);
    if (!rows.length) break;
    if (!dryRun) {
      const stmt = env.VIDEO_DB.prepare(jobSql);
      await env.VIDEO_DB.batch(rows.map((r) => stmt.bind(...jobValues(r))));
    }
    out.video_jobs += rows.length;
    if (rows.length < PAGE) break;
  }

  const evSql =
    `INSERT OR REPLACE INTO video_events (${EVENT_COLS.join(", ")}) ` +
    `VALUES (${EVENT_COLS.map(() => "?").join(", ")})`;

  for (let offset = 0; ; offset += PAGE) {
    const rows = await fetchPage(env, "video_events", offset, PAGE);
    if (!rows.length) break;
    if (!dryRun) {
      const stmt = env.VIDEO_DB.prepare(evSql);
      // An event whose job_id is missing from video_jobs would violate the
      // FK and abort the whole batch. Drop those and report them rather than
      // failing the migration over orphaned tracking rows.
      const keep = [];
      for (const r of rows) {
        if (!r.job_id) { out.errors.push(`event ${r.id}: null job_id`); continue; }
        keep.push(r);
      }
      if (keep.length) {
        try {
          await env.VIDEO_DB.batch(keep.map((r) => stmt.bind(...eventValues(r))));
        } catch (err) {
          // Fall back to row-by-row so one bad FK doesn't lose the batch.
          for (const r of keep) {
            try { await stmt.bind(...eventValues(r)).run(); }
            catch (e) { out.errors.push(`event ${r.id}: ${e?.message || e}`); }
          }
        }
      }
      out.video_events += keep.length;
    } else {
      out.video_events += rows.length;
    }
    if (rows.length < PAGE) break;
  }

  // Verify against what actually landed, not what we think we sent.
  const j = await env.VIDEO_DB.prepare(`SELECT COUNT(*) AS n FROM video_jobs`).first();
  const e = await env.VIDEO_DB.prepare(`SELECT COUNT(*) AS n FROM video_events`).first();
  out.d1_counts = { video_jobs: Number(j?.n) || 0, video_events: Number(e?.n) || 0 };
  out.source_counts = { video_jobs: out.video_jobs, video_events: out.video_events };
  out.match = !dryRun &&
    out.d1_counts.video_jobs === out.video_jobs &&
    out.d1_counts.video_events === out.video_events;
  out.elapsed_ms = Date.now() - started;
  return out;
}
