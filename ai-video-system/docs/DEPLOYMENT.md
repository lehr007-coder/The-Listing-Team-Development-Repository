# Deployment — AI Video Sidecar

## 1. Prerequisites (one-time)

### Cloudflare account
- [ ] R2 buckets created:
  - `tlt-ai-video` (prod), `tlt-ai-video-staging`
  - `tlt-ai-video-previews`, `tlt-ai-video-previews-staging`
- [ ] KV namespaces created — copy IDs into `wrangler*.toml`:
  - `wrangler kv:namespace create VIDEO_KV` (prod + preview)
  - `wrangler kv:namespace create VIDEO_KV_STAGING`
- [ ] Queue created:
  - `wrangler queues create ai-video-render`
  - `wrangler queues create ai-video-render-staging`
- [ ] Cloudflare Stream enabled on the account.
- [ ] Cloudflare Images enabled (optional — only used for branded JPG variants).
- [ ] Custom domains added in dash → Workers → ai-video-system → Triggers:
  - `videos.reallistingteam.com`
  - `media.reallistingteam.com`

### Supabase
- [ ] Apply `migrations/001_video_jobs.sql` against project
  `tglbjiehyfyrefxwgmzz` (ylopo-intelligence).

### GHL
- [ ] Run the existing-fields check in `migrations/002_ghl_custom_fields.md`.
- [ ] Create only the missing fields. **Never rename or delete existing.**
- [ ] Create the four Agent Studio agents from `agents/*.md`. Note their
      publish URLs.

## 2. Required environment variables / secrets

Set with `wrangler secret put <NAME> --config wrangler.staging.toml`
(then again for `wrangler.toml` for production).

| Secret                           | Required | Purpose |
|----------------------------------|----------|---------|
| `PROXY_API_KEY`                  | yes      | Inbound bearer for /v1/* (matches existing proxy convention) |
| `AI_VIDEO_API_KEY`               | optional | Alternate inbound bearer |
| `GHL_V2_TOKEN`                   | yes      | GHL OAuth token (read CFs + send messages) |
| `GHL_API_KEY`                    | optional | Fallback v1 key |
| `GHL_AGENT_STUDIO_TOKEN`         | optional | If Agent Studio publish endpoints require their own token |
| `SUPABASE_URL`                   | yes      | Ylopo intelligence project URL |
| `SUPABASE_KEY`                   | yes      | Service-role key |
| `HEYGEN_API_KEY`                 | yes      | HeyGen v2 API key |
| `HEYGEN_DEFAULT_AVATAR_ID`       | yes      | Default avatar |
| `HEYGEN_DEFAULT_VOICE_ID`        | yes      | Default voice |
| `HEYGEN_CALLBACK_SECRET`         | recommended | HMAC signing for HeyGen callbacks |
| `FCPXML_MCP_URL`                 | yes      | Base URL of the FCPXML MCP renderer |
| `FCPXML_MCP_API_KEY`             | yes      | Bearer for the renderer |
| `FCPXML_CALLBACK_SECRET`         | recommended | HMAC signing for FCPXML callbacks |
| `CF_ACCOUNT_ID`                  | yes      | Cloudflare account id (for Stream/Images APIs) |
| `CF_STREAM_API_TOKEN`            | yes      | Token with Stream:Edit |
| `CF_IMAGES_API_TOKEN`            | optional | Only if using CF Images |
| `CF_IMAGES_ACCOUNT_HASH`         | optional | imagedelivery.net hash |
| `AGENT_HEYGEN_SCRIPT_URL`        | optional | Direct Agent Studio publish URL (else falls back) |
| `AGENT_FCPXML_DIRECTOR_URL`      | optional | "" |
| `AGENT_VIDEO_DELIVERY_URL`       | optional | "" |
| `AGENT_SOCIAL_CONTENT_URL`       | optional | "" |
| `AGENT_FALLBACK_PROVIDER`        | optional | `anthropic` (default) or `openai` |
| `ANTHROPIC_API_KEY`              | if fallback=anthropic | |
| `OPENAI_API_KEY`                 | if fallback=openai | |
| `AGENT_MODEL`                    | optional | Defaults to `claude-sonnet-4-6` / `gpt-4o-mini` |
| `SOCIAL_DEFAULT_WEBHOOK`         | yes (for social) | Generic webhook (e.g. Make/GHL Social Planner) |
| `SOCIAL_TIKTOK_WEBHOOK`          | optional | Per-platform override |
| `SOCIAL_INSTAGRAM_REELS_WEBHOOK` | optional | "" |
| `SOCIAL_INSTAGRAM_STORIES_WEBHOOK`| optional | "" |
| `SOCIAL_FACEBOOK_REELS_WEBHOOK`  | optional | "" |
| `SOCIAL_FACEBOOK_STORIES_WEBHOOK`| optional | "" |
| `SOCIAL_YOUTUBE_SHORTS_WEBHOOK`  | optional | "" |
| `SOCIAL_DISPATCH_API_KEY`        | optional | Bearer for the social webhooks |

## 3. Deploy

### Staging (auto)

Push to `claude/**` or `main` → `.github/workflows/deploy-ai-video-staging.yml`
deploys `ai-video-system-staging` to Cloudflare.

Manual fallback:

```sh
cd ai-video-system
npx wrangler@latest deploy --config wrangler.staging.toml
```

### Production (manual)

```sh
cd ai-video-system
npx wrangler@latest deploy --config wrangler.toml
```

(Or extend `.github/workflows/deploy-production.yml` with a job mirror —
left as a follow-up to keep this PR additive.)

## 4. Smoke test

```sh
# health
curl -s https://ai-video-system-staging.lehr007.workers.dev/v1/health | jq

# heygen render (use a known test contact_id)
curl -s -X POST https://ai-video-system-staging.lehr007.workers.dev/v1/heygen/render \
  -H "X-API-Key: $PROXY_API_KEY" -H "Content-Type: application/json" \
  -d '{"contact_id":"<TEST>","video_type":"lead_nurture","trigger_reason":"smoke","delivery_channels":["email"]}'

# fcpxml render
curl -s -X POST https://ai-video-system-staging.lehr007.workers.dev/v1/fcpxml/render \
  -H "X-API-Key: $PROXY_API_KEY" -H "Content-Type: application/json" \
  -d '{"video_type":"market_update","trigger_reason":"smoke","distribution":"social","social_targets":["instagram_reels"]}'
```
