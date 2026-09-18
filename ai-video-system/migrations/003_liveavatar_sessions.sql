-- ai-video-system: LiveAvatar sessions. Apply against the ylopo-intelligence
-- Supabase project (tglbjiehyfyrefxwgmzz), same project as 001/002.
--
-- New table, owned by ai-video-system. Tracks live (real-time, billed
-- per-minute) LiveAvatar conversations, separate from the pre-rendered
-- video_jobs table. Row lifecycle: inserted at session mint ('active'),
-- updated on client-reported end ('ended') or by the daily-summary sweep
-- marking anything with no end event after N hours as 'unknown' (a closed
-- browser tab can't reliably fire the end-of-session beacon).

create table if not exists liveavatar_sessions (
  id                  uuid primary key default gen_random_uuid(),
  contact_id          text,                       -- nullable (anonymous site visitor)
  job_id              text references video_jobs(id) on delete set null,
  listing_id          text,
  avatar_id           text,
  mode                text,                       -- SessionMode.FULL | LITE
  status              text not null default 'active'
                        check (status in ('active','ended','unknown')),
  max_duration_s      int,
  duration_s          int,
  credits_estimated   numeric,
  end_reason          text,
  created_at          timestamptz default now(),
  ended_at            timestamptz
);

create index if not exists liveavatar_sessions_contact_idx on liveavatar_sessions (contact_id);
create index if not exists liveavatar_sessions_status_idx  on liveavatar_sessions (status);
create index if not exists liveavatar_sessions_created_idx on liveavatar_sessions (created_at desc);

-- RLS: service-role only (worker writes), same pattern as video_jobs/video_events.
alter table liveavatar_sessions enable row level security;
drop policy if exists liveavatar_sessions_service_only on liveavatar_sessions;
create policy liveavatar_sessions_service_only on liveavatar_sessions
  for all using (auth.role() = 'service_role')
  with check  (auth.role() = 'service_role');
