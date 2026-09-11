# ai-video-system

Sidecar Cloudflare Worker that adds an AI Video Intelligence Layer to The
Listing Team's existing GoHighLevel + Ylopo + Cloudflare ecosystem. Strictly
**additive** — does not modify any existing workflow, custom field,
webhook, automation, routing, or pipeline.

Two pipelines, one worker, plus an optional live layer:

1. **HEYGEN** — personalized avatar videos (SMS / email / GHL conversations)
2. **FCPXML** — cinematic branded reels for social distribution
3. **LiveAvatar** *(off by default — see [`docs/LIVEAVATAR.md`](docs/LIVEAVATAR.md))* —
   real-time conversational avatar, a separate HeyGen product/API/key,
   surfaced as a "Talk live now" button on the hosted video page

## Quick links

| Doc | What's in it |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Module map, data-flow diagram, isolation guarantees |
| [`docs/WORKFLOWS.md`](docs/WORKFLOWS.md) | The two NEW GHL workflows + callback flow |
| [`docs/PAYLOADS.md`](docs/PAYLOADS.md) | Every webhook request/response shape |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Secrets list, prerequisites, smoke tests |
| [`docs/TESTING.md`](docs/TESTING.md) | Unit + integration + isolation regression checks |
| [`docs/RISK.md`](docs/RISK.md) | Risk matrix |
| [`docs/LIVEAVATAR.md`](docs/LIVEAVATAR.md) | LiveAvatar (live conversational avatar) — go-live checklist, cost guardrails |
| [`docs/ROLLOUT.md`](docs/ROLLOUT.md) | Phased rollout order |
| [`migrations/001_video_jobs.sql`](migrations/001_video_jobs.sql) | Supabase tables |
| [`migrations/002_ghl_custom_fields.md`](migrations/002_ghl_custom_fields.md) | GHL field setup + collision check |
| [`agents/*.md`](agents/) | Four Agent Studio prompts (paste-and-go) |

## What it owns vs. what it reads

| Surface | Mode |
|---|---|
| Supabase tables `video_jobs`, `video_events` | **owned** (RW) |
| Supabase table `liveavatar_sessions` | **owned** (RW) — off by default, see `docs/LIVEAVATAR.md` |
| Supabase tables `events`, `leads`, `listings`, `scoring_log` | read-only (sidecar appends `source='ai_video'` rows to `scoring_log` only) |
| GHL custom fields `ai_video_*`, `video_*`, `social_content_type`, `worthy_of_social`, `last_video_*` | **owned** (RW) — see allowlist in `lib/ghl.js` |
| Every other GHL custom field | read-only |
| GHL workflows `AI VIDEO — HEYGEN`, `AI VIDEO — FCPXML` | **owned** (new, in their own folder) |
| Every other GHL workflow / automation / pipeline | untouched |
| R2 buckets `tlt-ai-video`, `tlt-ai-video-previews` | **owned** |
| KV namespace `VIDEO_KV` | **owned** |
| Queue `ai-video-render` | **owned** |
| Stream account | shared (own UIDs) |
| Subdomains `videos.reallistingteam.com`, `media.reallistingteam.com` | **owned** |

## Top-level routes

```
# Public
GET  /v1/health                       Service + binding status
GET  /v1/analytics/open?job=<id>      1x1 GIF open pixel
GET  /v1/analytics/click?job=<id>&to= 302 redirect + click event (src= optional)
POST /v1/analytics/event              Generic event ingest (watch milestones)
GET  /v/:jobId                        Public hosted player page
GET  /media/{v|p}/<key>               R2 passthrough
GET  /admin                           HTML dashboard (auth via in-page X-API-Key)

# Render pipelines (auth)
POST /v1/heygen/render                Trigger personalized avatar video
POST /v1/heygen/callback              HeyGen → us (HMAC, no key)
POST /v1/fcpxml/render                Trigger cinematic reel
POST /v1/fcpxml/callback              FCPXML MCP → us (HMAC, no key)
POST /v1/delivery/send                Manual delivery re-run for a private job
POST /v1/social/publish               Manual social distribution

# LiveAvatar (off by default — see docs/LIVEAVATAR.md)
GET  /v1/liveavatar/widget.js          Browser widget JS
POST /v1/liveavatar/session            Mint a live-session token
POST /v1/liveavatar/session/:id/end    Best-effort usage/cost logging

# Admin / observability (auth)
GET    /v1/admin/jobs                 List jobs (?contact_id, ?status, ?render_engine)
GET    /v1/admin/jobs/:id             Inspect job
GET    /v1/admin/jobs/:id/events      All events for a job
GET    /v1/admin/jobs/:id/tracking    Aggregated engagement summary
POST   /v1/admin/jobs/:id/fail        Manually fail a stuck job
POST   /v1/admin/jobs/:id/reprocess   Force re-run post-render with given URL
GET    /v1/admin/contacts/:id/videos  All videos for a contact
GET    /v1/admin/contacts/top         Engagement leaderboard
GET    /v1/admin/daily-summary        24h (or N-day) rollup w/ CTR per channel
GET    /v1/admin/health-deep          /v1/health + Supabase counters
GET    /v1/admin/rate-limits          KV-backed daily counters vs caps
GET    /v1/admin/kill                 Kill-switch state
POST   /v1/admin/kill                 Activate kill-switch (paused)
DELETE /v1/admin/kill                 Clear kill-switch (resume)
GET    /v1/admin/liveavatar/kill              LiveAvatar kill-switch (independent of the above)
POST   /v1/admin/liveavatar/kill              Pause LiveAvatar sessions
DELETE /v1/admin/liveavatar/kill              Resume
GET    /v1/admin/liveavatar/rate-limits       Live session-cap counters
GET    /v1/admin/liveavatar/sessions          List sessions (?contact_id, ?status)
GET    /v1/admin/liveavatar/sessions/:id      Inspect one session
POST   /v1/admin/agents/test          Invoke an agent (no HeyGen credit spent)
```

All `/v1/*` routes (except `/v1/health` and `/v1/analytics`) require
`X-API-Key: <PROXY_API_KEY>`. Callback routes additionally HMAC-verify
when `HEYGEN_CALLBACK_SECRET` / `FCPXML_CALLBACK_SECRET` are set.

## Cost guardrails

Two soft caps + an instant kill-switch — all KV-backed, no redeploy
needed to flip them.

| Control | Default | How to change |
|---|---|---|
| `DAILY_RENDER_LIMIT`     (global)      | `100` | env var in `wrangler.toml`, redeploy |
| `PER_CONTACT_DAILY_LIMIT` (per contact) | `3`   | env var in `wrangler.toml`, redeploy |
| Kill-switch              (instant pause) | off   | `POST /v1/admin/kill { reason }` |

## Aspect ratio

Defaults to **9:16 vertical** (mobile, SMS, social). Auto-switches to
**16:9 horizontal** if the render is email-only. Override with
`overrides.aspect: "9:16" | "16:9" | "1:1" | "4:5"` in the render
payload.

## Local dev

```sh
cd ai-video-system
npx wrangler dev --config wrangler.staging.toml
```

`.dev.vars` (gitignored) for local secrets — see `docs/DEPLOYMENT.md`.

## Smoke test

```sh
PROXY_API_KEY=xxx BASE_URL=https://videos.reallistingteam.com \
  ./scripts/verify.sh
```

Covers health + bindings, auth, hosted player, tracking pixel, click
redirect, rate-limits, kill-switch, daily-summary, contacts/top,
admin dashboard HTML, and agent-test discovery. Zero render cost.

## Deploy

CI auto-deploys on push to `main` or `claude/**` →
`.github/workflows/deploy-ai-video-staging.yml` runs staging then
production sequentially. Manual deploy:

```sh
cd ai-video-system
npx wrangler deploy --config wrangler.staging.toml   # staging
npx wrangler deploy --config wrangler.toml           # prod
```
