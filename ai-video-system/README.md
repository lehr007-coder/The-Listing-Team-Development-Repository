# ai-video-system

Sidecar Cloudflare Worker that adds an AI Video Intelligence Layer to The
Listing Team's existing GoHighLevel + Ylopo + Cloudflare ecosystem. Strictly
**additive** — does not modify any existing workflow, custom field,
webhook, automation, routing, or pipeline.

Two pipelines, one worker:

1. **HEYGEN** — personalized avatar videos (SMS / email / GHL conversations)
2. **FCPXML** — cinematic branded reels for social distribution

## Quick links

| Doc | What's in it |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Module map, data-flow diagram, isolation guarantees |
| [`docs/WORKFLOWS.md`](docs/WORKFLOWS.md) | The two NEW GHL workflows + callback flow |
| [`docs/PAYLOADS.md`](docs/PAYLOADS.md) | Every webhook request/response shape |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Secrets list, prerequisites, smoke tests |
| [`docs/TESTING.md`](docs/TESTING.md) | Unit + integration + isolation regression checks |
| [`docs/RISK.md`](docs/RISK.md) | Risk matrix |
| [`docs/ROLLOUT.md`](docs/ROLLOUT.md) | Phased rollout order |
| [`migrations/001_video_jobs.sql`](migrations/001_video_jobs.sql) | Supabase tables |
| [`migrations/002_ghl_custom_fields.md`](migrations/002_ghl_custom_fields.md) | GHL field setup + collision check |
| [`agents/*.md`](agents/) | Four Agent Studio prompts (paste-and-go) |

## What it owns vs. what it reads

| Surface | Mode |
|---|---|
| Supabase tables `video_jobs`, `video_events` | **owned** (RW) |
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
GET  /v1/health                       Service + binding status
POST /v1/heygen/render                Trigger personalized avatar video
POST /v1/heygen/callback              HeyGen → us
GET  /v1/heygen/jobs/:id              Inspect job
POST /v1/fcpxml/render                Trigger cinematic reel
POST /v1/fcpxml/callback              FCPXML MCP → us
GET  /v1/fcpxml/jobs/:id              Inspect job
POST /v1/delivery/send                Manual delivery re-run for a private job
POST /v1/social/publish               Manual social distribution
GET  /v1/analytics/open?job=<id>      1x1 GIF open pixel
GET  /v1/analytics/click?job=<id>&to= 302 redirect + click event
POST /v1/analytics/event              Generic event ingest
GET  /v/:jobId                        Public hosted player page
GET  /media/{v|p}/<key>               R2 passthrough
```

All `/v1/*` routes (except `/v1/health` and `/v1/analytics`) require
`X-API-Key: <PROXY_API_KEY>`. Callback routes additionally HMAC-verify
when `HEYGEN_CALLBACK_SECRET` / `FCPXML_CALLBACK_SECRET` are set.

## Local dev

```sh
cd ai-video-system
npx wrangler dev --config wrangler.staging.toml
```

`.dev.vars` (gitignored) for local secrets — see `docs/DEPLOYMENT.md`.

## Deploy

Pushes to `main` or `claude/**` trigger the new staging workflow at
`.github/workflows/deploy-ai-video-staging.yml`. Production deploy is
manual via `wrangler deploy --config wrangler.toml` from inside
`ai-video-system/`.
