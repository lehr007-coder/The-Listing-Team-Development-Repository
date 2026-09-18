-- ai-video-system sidecar tables, D1 (SQLite) edition.
--
-- Port of migrations/001_video_jobs.sql, which targeted the ylopo-intelligence
-- Supabase project. These two tables are OWNED by ai-video-system, which is why
-- they can move to Cloudflare. The intelligence tables (leads, events, listings,
-- scoring_log) are owned by another system and STAY on Supabase.
--
-- Postgres -> SQLite translation notes:
--   text[]        -> TEXT holding a JSON array. Default '[]' (not '{}').
--   jsonb         -> TEXT holding JSON. Default '{}' where Postgres had it.
--   timestamptz   -> TEXT holding an ISO-8601 UTC string, so lexical sort
--                    equals chronological sort and existing `order by
--                    created_at desc` semantics carry over unchanged.
--   now()         -> no SQLite equivalent that yields ISO-8601 with an offset,
--                    so the application supplies created_at. Enforced NOT NULL
--                    to make a missed write fail loudly instead of silently
--                    inserting NULL and breaking ordering.
--   gen_random_uuid() -> application supplies crypto.randomUUID().
--   RLS policies  -> dropped. D1 is reachable only through this Worker's
--                    binding; there is no anon/PostgREST surface to defend.
--                    Access control is the Worker's PROXY_API_KEY, as before.

CREATE TABLE IF NOT EXISTS video_jobs (
  id                  TEXT PRIMARY KEY,
  contact_id          TEXT,
  video_type          TEXT NOT NULL,
  render_engine       TEXT NOT NULL CHECK (render_engine IN ('HEYGEN','FCPXML')),
  distribution        TEXT NOT NULL DEFAULT 'private'
                        CHECK (distribution IN ('private','social')),
  status              TEXT NOT NULL DEFAULT 'queued'
                        CHECK (status IN ('queued','rendering','rendered','delivering','delivered','failed')),
  trigger_reason      TEXT,
  priority_score      INTEGER DEFAULT 50,
  delivery_channels   TEXT DEFAULT '[]',
  social_targets      TEXT DEFAULT '[]',
  scheduled_post_at   TEXT,
  listing_id          TEXT,
  listing_data        TEXT,
  market_data         TEXT,
  script              TEXT,
  script_meta         TEXT,
  scene_plan          TEXT,
  social_copy         TEXT,
  heygen_video_id     TEXT,
  fcpxml_job_id       TEXT,
  r2_key              TEXT,
  r2_url              TEXT,
  stream_uid          TEXT,
  stream_hls          TEXT,
  stream_dash         TEXT,
  hosted_url          TEXT,
  gif_url             TEXT,
  thumbnail_url       TEXT,
  cta_url             TEXT,
  aspect              TEXT DEFAULT '9:16',
  delivery_results    TEXT,
  engagement_score    INTEGER DEFAULT 0,
  last_event          TEXT,
  last_event_at       TEXT,
  created_at          TEXT NOT NULL,
  rendered_at         TEXT,
  delivered_at        TEXT,
  failed_at           TEXT,
  error               TEXT
);

CREATE INDEX IF NOT EXISTS video_jobs_contact_idx       ON video_jobs (contact_id);
CREATE INDEX IF NOT EXISTS video_jobs_status_idx        ON video_jobs (status);
CREATE INDEX IF NOT EXISTS video_jobs_created_idx       ON video_jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS video_jobs_active_lookup_idx ON video_jobs (contact_id, video_type, status);

-- Supports the poll-fallback scan: status='rendering' AND render_engine='HEYGEN'
-- ordered by created_at. Postgres served this from the status index; giving it
-- a covering index here keeps that scan cheap as the table grows.
CREATE INDEX IF NOT EXISTS video_jobs_poll_fallback_idx
  ON video_jobs (status, render_engine, created_at);

CREATE TABLE IF NOT EXISTS video_events (
  id          TEXT PRIMARY KEY,
  job_id      TEXT NOT NULL REFERENCES video_jobs(id) ON DELETE CASCADE,
  contact_id  TEXT,
  event       TEXT NOT NULL,
  meta        TEXT DEFAULT '{}',
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS video_events_job_idx     ON video_events (job_id);
CREATE INDEX IF NOT EXISTS video_events_contact_idx ON video_events (contact_id);
CREATE INDEX IF NOT EXISTS video_events_created_idx ON video_events (created_at DESC);
