-- ai-video-system: sidecar tables. Apply against the ylopo-intelligence
-- Supabase project (tglbjiehyfyrefxwgmzz).
--
-- These tables are NEW and OWNED by ai-video-system. The existing scoring,
-- pipeline, and event tables are NOT touched.

create extension if not exists "pgcrypto";

-- ── video_jobs: one row per render request ────────────────────────────────
create table if not exists video_jobs (
  id                  text primary key,
  contact_id          text,                       -- nullable (social-only jobs)
  video_type          text not null,
  render_engine       text not null check (render_engine in ('HEYGEN','FCPXML')),
  distribution        text not null default 'private' check (distribution in ('private','social')),
  status              text not null default 'queued'
                        check (status in ('queued','rendering','rendered','delivering','delivered','failed')),
  trigger_reason      text,
  priority_score      int default 50,
  delivery_channels   text[] default '{}',
  social_targets      text[] default '{}',
  scheduled_post_at   timestamptz,
  listing_id          text,
  listing_data        jsonb,
  market_data         jsonb,
  script              text,
  script_meta         jsonb,
  scene_plan          jsonb,
  social_copy         jsonb,
  -- upstream renderer ids
  heygen_video_id     text,
  fcpxml_job_id       text,
  -- output assets
  r2_key              text,
  r2_url              text,
  stream_uid          text,
  stream_hls          text,
  stream_dash         text,
  hosted_url          text,
  gif_url             text,
  thumbnail_url       text,
  cta_url             text,
  aspect              text default '9:16',
  -- delivery
  delivery_results    jsonb,
  -- engagement
  engagement_score    int default 0,
  last_event          text,
  last_event_at       timestamptz,
  -- lifecycle
  created_at          timestamptz default now(),
  rendered_at         timestamptz,
  delivered_at        timestamptz,
  failed_at           timestamptz,
  error               text
);

create index if not exists video_jobs_contact_idx on video_jobs (contact_id);
create index if not exists video_jobs_status_idx on video_jobs (status);
create index if not exists video_jobs_created_idx on video_jobs (created_at desc);
create index if not exists video_jobs_active_lookup_idx
  on video_jobs (contact_id, video_type, status);

-- RLS: this table is service-role only (worker writes). No anon access.
alter table video_jobs enable row level security;
drop policy if exists video_jobs_service_only on video_jobs;
create policy video_jobs_service_only on video_jobs
  for all using (auth.role() = 'service_role')
  with check  (auth.role() = 'service_role');

-- ── video_events: every open / click / watch / cta_click row ──────────────
create table if not exists video_events (
  id          uuid primary key default gen_random_uuid(),
  job_id      text not null references video_jobs(id) on delete cascade,
  contact_id  text,
  event       text not null,
  meta        jsonb default '{}'::jsonb,
  created_at  timestamptz default now()
);

create index if not exists video_events_job_idx     on video_events (job_id);
create index if not exists video_events_contact_idx on video_events (contact_id);
create index if not exists video_events_created_idx on video_events (created_at desc);

alter table video_events enable row level security;
drop policy if exists video_events_service_only on video_events;
create policy video_events_service_only on video_events
  for all using (auth.role() = 'service_role')
  with check  (auth.role() = 'service_role');
