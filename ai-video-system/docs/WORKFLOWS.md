# Workflow Map — AI Video Sidecar

## A. NEW GHL workflows to create (DO NOT modify existing ones)

> Both workflows live in **their own folder**: `AI Video — Sidecar`.

### A1. `AI VIDEO — HEYGEN`

**Purpose:** Personalized avatar videos.

| Step | Block | Config |
|------|-------|--------|
| 1 | Trigger (any of) | • Custom Field Changed — `seller_estimated_value` becomes non-empty<br>• Tag Added — `fsbo`<br>• Custom Field Changed — `event_type` = `SHOWING_REQUEST`<br>• Custom Field Changed — `event_type` = `FAVORITE_LISTING` and lead_score ≥ 70<br>• Custom Field Changed — `lead_priority_label` = `HOT` |
| 2 | If/Else | Skip if `video_status` ∈ {`rendering`,`delivering`} |
| 3 | Webhook (POST) | URL: `https://videos.reallistingteam.com/v1/heygen/render`<br>Header: `X-API-Key: {{custom.PROXY_API_KEY}}`<br>Body: see PAYLOADS.md → `heygen.render` |
| 4 | Wait (no-op) | Sidecar runs the rest async. Workflow can finish here. |

The sidecar updates `video_status`, `video_url`, `video_gif_url`,
`video_last_rendered`, `video_last_sent` on the contact directly.
**No further workflow steps needed.**

#### Recommended trigger conditions per `video_type`

Every `video_type` is a separate sub-workflow (or a single workflow with an
If/Else branch on the trigger). The webhook body passes
`video_type: "<value>"` and the script agent handles the rest. The 12
supported values, plus their default trigger:

| `video_type` | GHL trigger condition | Notes |
|---|---|---|
| `seller_valuation` | Custom Field Changed — `seller_estimated_value` set | The original anchor flow |
| `fsbo_outreach` | Tag Added — `fsbo` | Or custom field `fsbo_address` populated |
| `expired_listing` | Tag Added — `expired-listing` | Or custom field `listing_status` = `expired` |
| `buyer_activity` | Custom Field Changed — `event_type` = `FAVORITE_LISTING` AND `lead_score` ≥ 70 | Tunable threshold |
| `new_listing_match` | Custom Field Changed — `new_listing_match_address` populated by Ylopo | Or tag `new-listing-alert` |
| `market_update` | Scheduled workflow — monthly, segmented by neighborhood tag | Or tag `monthly-market-update` |
| `open_house_invite` | Custom Field Changed — `open_house_date` within 7 days | Trigger filter the date in workflow |
| `showing_request` | Custom Field Changed — `event_type` = `SHOWING_REQUEST` | |
| `appointment_reminder` | Custom Field Changed — `appointment_at` within 24 hours | |
| `mortgage_update` | Tag Added — `mortgage-watch` AND scheduled monthly | Or external rate-alert webhook |
| `lead_nurture` | Custom Field Changed — `lead_score` increased by ≥ 10 | Catch-all for warming leads |
| `priority_lead` | Custom Field Changed — `lead_priority_label` = `HOT` | High-touch leads |

Each branch should also pass an appropriate `delivery_channels` array based
on the persona's contactability (e.g. expired-listing prefers `email` over
`sms` since the contact may be hostile to texts).

### A2. `AI VIDEO — FCPXML`

**Purpose:** Cinematic branded reels for social.

| Step | Block | Config |
|------|-------|--------|
| 1 | Trigger (any of) | • Custom Field Changed — `worthy_of_social` = `true`<br>• Manual trigger from Listing detail action button<br>• Scheduled (weekly market_update) |
| 2 | Webhook (POST) | URL: `https://videos.reallistingteam.com/v1/fcpxml/render`<br>Header: `X-API-Key: {{custom.PROXY_API_KEY}}`<br>Body: see PAYLOADS.md → `fcpxml.render` |
| 3 | (end) | Async render + auto-publish via SOCIAL_*_WEBHOOK envs. |

## B. Callback flow

```
HeyGen ─┐                                     ┌─ FCPXML MCP
        ▼                                     ▼
 POST /v1/heygen/callback              POST /v1/fcpxml/callback
 verifyHmac (X-Signature)              verifyHmac (X-Signature)
 dedupe via VIDEO_KV                   dedupe via VIDEO_KV
 → RENDER_QUEUE.send({jobId,           → RENDER_QUEUE.send({...})
   sourceMp4Url, kind})

                       ▼
              queue-consumer.js
              ─ MP4 → R2
              ─ MP4 → Cloudflare Stream
              ─ Build hostedUrl + gifUrl + thumbnailUrl
              ─ updateVideoJob(rendered)
              ─ writeOwnedFields(GHL: video_*)
              ─ insertVideoEvent(rendered)
              ─ branch:
                  • distribution=private → runDelivery() (SMS/email/conv)
                  • distribution=social  → runSocialDistribution()
```

## C. Public landing flow

```
SMS / email link →  https://videos.reallistingteam.com/v/<jobId>
                    ─ HTML page renders one of:
                       • Cloudflare Stream iframe (if stream_uid set)
                       • Native HTML5 <video> from R2 (fallback)
                    ─ <img> open pixel       → /v1/analytics/open
                    ─ Watch heartbeats:
                       • Stream:  postMessage → /v1/analytics/event
                       • Native:  DOM events  → /v1/analytics/event
                    ─ CTA button → /v1/analytics/click?to=<dest>&src=...
                                                                 → 302
```

Watch milestones (`watch_25` / `watch_50` / `watch_75` / `watch_100`)
are deduped per page-load via `window.__sent` so a viewer can't inflate
their own count by scrubbing. A `play` after `watch_100` fires a
`rewatch` event.

## D. Aspect-ratio defaults

| Channel mix | Default aspect | Why |
|---|---|---|
| includes SMS / conversation | 9:16 vertical | Mobile-first, social-native |
| email-only render           | 16:9 horizontal | Renders bigger inline in mail clients |

Override with `overrides.aspect: "9:16" | "16:9" | "1:1" | "4:5"` in
the render payload. The hosted player picks `max-width: 480px` for
vertical, `720px` for horizontal.

## E. Cost guardrails (operational)

| Surface | Trigger | Behavior |
|---|---|---|
| Global daily cap (`DAILY_RENDER_LIMIT`)         | Reached on render | 429 from `/v1/heygen/render` and `/v1/fcpxml/render` |
| Per-contact daily cap (`PER_CONTACT_DAILY_LIMIT`) | Reached for one contact | 429, only that contact blocked |
| Kill-switch (`/v1/admin/kill`)                   | POSTed | All renders 429 instantly, no redeploy |

State viewable at `/v1/admin/rate-limits` and `/admin` dashboard.
