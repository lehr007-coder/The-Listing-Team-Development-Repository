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
                    ─ HTML page with Cloudflare Stream iframe (autoplay)
                    ─ <img> open pixel → /v1/analytics/open
                    ─ Watch heartbeats → /v1/analytics/event (postMessage)
                    ─ CTA button → /v1/analytics/click?to=<dest>  → 302
```
