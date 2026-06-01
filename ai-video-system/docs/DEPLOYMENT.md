# Deployment — AI Video Sidecar

> **Status (2026-05-07):** Production deployed at `videos.reallistingteam.com`
> + `media.reallistingteam.com`. Cron `* * * * *` active. Queue
> `ai-video-render` provisioned. 10 secrets uploaded. Both GHL workflows
> (`AI VIDEO — HEYGEN`, `AI VIDEO — FCPXML`) cut over to production URL.

## HeyGen webhook configuration (one-time)

HeyGen's per-request `callback_url` field has been observed to silently
drop on v2 `/video/generate`. Two options:

1. **Account-level webhook (preferred if HeyGen supports it):** HeyGen →
   Settings → Webhooks → register
   `https://videos.reallistingteam.com/v1/heygen/callback` as a global
   webhook for `avatar_video.success` + `avatar_video.fail` events.
2. **Cron poll-fallback (already shipped):** `lib/heygen-poll-fallback.js`
   polls Supabase every minute for stuck-rendering HEYGEN jobs (age 60s
   → 30min), queries HeyGen status, and dispatches a synthetic callback
   if HeyGen reports `completed`. This works without any HeyGen
   account-level config.

The poll-fallback is sufficient for production — webhook registration is
nice-to-have for sub-minute latency on delivery.

## One-time prod deploy reference

This is what was actually run against the production worker on 2026-05-07:

```sh
cd ai-video-system
# 1. Provision the queue (idempotent)
npx wrangler@latest queues create ai-video-render
# 2. Bulk-upload secrets via temp JSON file (rotated after deploy)
npx wrangler@latest secret bulk /tmp/ai-video-prod-secrets.json --config wrangler.toml
# 3. Deploy
npx wrangler@latest deploy --config wrangler.toml
```

After deploy, custom domains were already bound (Cloudflare auto-handles
when zone is on the same account); confirmed via `/v1/health` returning
`env: production` on both subdomains.



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
| `BRAND_NAME`                     | optional | Display name, default "The Listing Team" |
| `BRAND_LOGO_URL`                 | optional | https URL to PNG/SVG logo (~200×60). Used in email header. |
| `BRAND_PRIMARY_COLOR`            | optional | Hex color for CTA buttons + accents, default `#ff6a00` |
| `BRAND_TEXT_COLOR`               | optional | Email body text color, default `#222222` |
| `BRAND_BG_COLOR`                 | optional | Email background, default `#f6f6f6` |
| `BRAND_WEBSITE_URL`              | optional | Homepage URL — logo + footer link target |
| `BRAND_FOOTER_TEXT`              | optional | Replaces the default `© <year> <name>` line |
| `BRAND_UNSUBSCRIBE_URL`          | optional | If set, adds an Unsubscribe link to the email footer |
| `BRAND_AGENT_SIGNATURE`          | optional | Overrides per-contact agent name fallback |

All `BRAND_*` vars have sensible defaults — the worker renders branded
emails out of the box. Setting any of them rebrands without a code change.

## 3. Deploy

### Staging (auto)

Push to `claude/**` or `main` → `.github/workflows/deploy-ai-video-staging.yml`
deploys `ai-video-system-staging` to Cloudflare.

Manual fallback:

```sh
cd ai-video-system
npx wrangler@latest deploy --config wrangler.staging.toml
```

### Production (auto)

Same workflow runs the production job sequentially after staging
succeeds. Manual fallback:

```sh
cd ai-video-system
npx wrangler@latest deploy --config wrangler.toml
```

## 4. Smoke test

The full read-only suite (zero render cost) lives in `scripts/verify.sh`:

```sh
PROXY_API_KEY=xxx BASE_URL=https://videos.reallistingteam.com \
  ./scripts/verify.sh
```

Or hit individual endpoints:

```sh
# health
curl -s https://videos.reallistingteam.com/v1/health | jq

# rate-limits + kill-switch state
curl -sf -H "X-API-Key: $KEY" https://videos.reallistingteam.com/v1/admin/rate-limits | jq
curl -sf -H "X-API-Key: $KEY" https://videos.reallistingteam.com/v1/admin/kill | jq

# 24h rollup
curl -sf -H "X-API-Key: $KEY" "https://videos.reallistingteam.com/v1/admin/daily-summary?days=1" | jq

# Iterate on agent prompts without burning HeyGen credits
curl -sf -X POST -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"agent":"video_delivery"}' \
  https://videos.reallistingteam.com/v1/admin/agents/test | jq
```

Trigger a real render only after the read-only suite is green:

```sh
curl -s -X POST https://videos.reallistingteam.com/v1/heygen/render \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"contact_id":"<TEST>","video_type":"lead_nurture","trigger_reason":"smoke","delivery_channels":["email"]}'
```

## 5. Cost guardrails (operational)

Two soft caps + an instant kill-switch, all KV-backed (no redeploy
needed to flip the kill).

```sh
# Pause everything immediately (returns 429 from /v1/heygen/render)
curl -sf -X POST -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"reason":"investigating runaway loop","set_by":"scott"}' \
  https://videos.reallistingteam.com/v1/admin/kill

# Resume
curl -sf -X DELETE -H "X-API-Key: $KEY" \
  https://videos.reallistingteam.com/v1/admin/kill
```

Daily caps live in `wrangler.toml` `[vars]` — tune and redeploy:

```toml
DAILY_RENDER_LIMIT = "100"
PER_CONTACT_DAILY_LIMIT = "3"
```

## 6. Dashboard

`https://videos.reallistingteam.com/admin` — single-page HTML. Asks
for `PROXY_API_KEY` once, stores in `localStorage`, refreshes every
30s. Shows daily counts, rate-limit usage, kill-switch toggle, CTR
per channel, watch funnel, top-engagement leaderboard, and recent
jobs (click for detail).
