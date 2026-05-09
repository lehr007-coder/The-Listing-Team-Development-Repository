# Webhook Payloads — AI Video Sidecar

All inbound API endpoints require either:
- `X-API-Key: <PROXY_API_KEY or AI_VIDEO_API_KEY>`, or
- `Authorization: Bearer <same key>`

## 1. `POST /v1/heygen/render`

```json
{
  "contact_id": "abc123",
  "video_type": "seller_valuation",
  "trigger_reason": "Ylopo HOT lead - 3 favorites in 24h",
  "priority_score": 88,
  "delivery_channels": ["sms", "email"],
  "overrides": {
    "avatar_id": "optional_heygen_avatar_id",
    "voice_id": "optional_heygen_voice_id",
    "script": "optional pre-written script (skips agent)"
  }
}
```

**Allowed `video_type`:** `seller_valuation`, `fsbo_outreach`,
`buyer_activity`, `showing_request`, `appointment_reminder`,
`lead_nurture`, `priority_lead`.

Response:
```json
{ "job_id": "vj_lk2_8f...", "status": "rendering", "heygen_video_id": "..." }
```

If a job for the same `contact_id` + `video_type` is already in flight,
returns `{ "deduped": true, ... }` instead.

## 2. `POST /v1/fcpxml/render`

```json
{
  "video_type": "luxury_listing",
  "listing_id": "MLS_123",
  "trigger_reason": "worthy_of_social=true on listing import",
  "distribution": "social",
  "social_targets": ["instagram_reels", "tiktok", "youtube_shorts", "facebook_reels"],
  "scheduled_post_at": null,
  "overrides": {
    "aspect": "9:16",
    "duration_target_s": 45,
    "music": { "mood": "uplifting_modern" }
  }
}
```

**Allowed `video_type`:** `luxury_listing`, `market_update`,
`youtube_short`, `idx_showcase`, `community_spotlight`, `social_brand`.

For `private` distribution (rare for FCPXML), pass `contact_id` and use
`delivery_channels` instead of `social_targets`.

Response:
```json
{ "job_id": "vj_lk2_...", "status": "rendering", "fcpxml_job_id": "..." }
```

## 3. `POST /v1/heygen/callback` (HeyGen → us)

```json
{
  "event_type": "avatar_video.success",
  "event_data": {
    "video_id": "heygen_uuid",
    "url": "https://heygen-files.s3.../result.mp4",
    "callback_id": "vj_lk2_..."
  }
}
```

Headers: `X-Signature: sha256=<hex>` if `HEYGEN_CALLBACK_SECRET` is set.

## 4. `POST /v1/fcpxml/callback` (FCPXML MCP → us)

```json
{
  "job_id": "vj_lk2_...",
  "status": "complete",
  "mp4_url": "https://render.fcpxml.../out.mp4",
  "vertical_crops": {
    "9_16": "https://...mp4",
    "1_1":  "https://...mp4",
    "16_9": "https://...mp4"
  }
}
```

## 5. `POST /v1/delivery/send`

```json
{ "job_id": "vj_lk2_..." }
```

Re-runs delivery for an already-rendered private job.

## 6. `POST /v1/social/publish`

```json
{ "job_id": "vj_lk2_..." }
```

Manually triggers social distribution. Refuses non-social jobs.

## 7. Analytics

```
GET  /v1/analytics/open?job=<id>           → 1x1 GIF
GET  /v1/analytics/click?job=<id>&to=<url> → 302 redirect
POST /v1/analytics/event   { job_id, event, contact_id?, meta? }
```

`event` ∈ `open`, `click`, `cta_click`, `watch_25`, `watch_50`,
`watch_75`, `watch_100`, `rewatch`.
