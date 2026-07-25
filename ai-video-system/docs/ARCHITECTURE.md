# Architecture — AI Video Sidecar

## 1. One-line summary

A standalone Cloudflare Worker (`ai-video-system`) that runs **alongside**
`thelistingteamproxy` and reads existing GHL + Ylopo + Supabase intelligence
to produce, host, deliver, and measure AI-generated videos. It owns its own
Supabase tables, its own R2 buckets, its own KV namespace, its own queue,
and its own GHL custom fields. It mutates **nothing** else.

## 2. High-level flow

```
                 ┌────────────────────────────────────────────────────┐
                 │  EXISTING SYSTEMS (read-only from sidecar)         │
                 │  ─ thelistingteamproxy  ─ Ylopo events             │
                 │  ─ GHL contacts/CFs     ─ scoring_log              │
                 │  ─ leads / listings     ─ pipeline_items           │
                 └────────────────────────────────────────────────────┘
                                       │  reads (Bearer GHL_V2_TOKEN, Supabase service-role)
                                       ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │  ai-video-system  (Cloudflare Worker, this repo's sidecar)           │
  │                                                                      │
  │   /v1/heygen/render  ─┐                                              │
  │   /v1/fcpxml/render  ─┤  → invokeAgent(...)  → upstream renderer     │
  │                       │                       (HeyGen / FCPXML MCP)  │
  │   /v1/heygen/callback ┐                                              │
  │   /v1/fcpxml/callback ┘  → RENDER_QUEUE → consumer:                  │
  │                              MP4 → R2 (VIDEO_BUCKET)                 │
  │                              MP4 → Cloudflare Stream                 │
  │                              GIF/JPG → Stream thumbnails             │
  │                              update video_jobs + GHL CFs             │
  │                              ↳ private  → runDelivery()  (SMS/email) │
  │                              ↳ social   → runSocial()    (TikTok/IG) │
  │                                                                      │
  │   /v/:jobId           public hosted player + open pixel              │
  │   /v1/analytics/...   open / click / watch tracking                  │
  │   /media/{v|p}/<key>  R2 passthrough                                 │
  └──────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
                ┌────────────────────────────────────────┐
                │  Sidecar-owned state                   │
                │  ─ Supabase: video_jobs, video_events  │
                │  ─ R2:  tlt-ai-video, tlt-ai-video-previews │
                │  ─ KV:  VIDEO_KV (callback dedupe, …)   │
                │  ─ Stream UIDs (HLS + thumbs + GIF)     │
                │  ─ GHL custom fields ai_video_* / video_*│
                └────────────────────────────────────────┘
```

## 3. Module layout

```
ai-video-system/
├── worker.js               entry + route table
├── routes/
│   ├── health.js           GET /v1/health
│   ├── heygen.js           POST /v1/heygen/render, /callback   GET /jobs/:id
│   ├── fcpxml.js           POST /v1/fcpxml/render, /callback   GET /jobs/:id
│   ├── delivery.js         POST /v1/delivery/send
│   ├── social.js           POST /v1/social/publish
│   ├── analytics.js        GET  /v1/analytics/{open,click}, POST /event
│   ├── hosted.js           GET  /v/:jobId
│   ├── media.js            GET  /media/{v|p}/<key>
│   └── liveavatar.js       POST /v1/liveavatar/session[/:id/end], GET /widget.js (off by default)
├── lib/
│   ├── util.js             json / cors / auth / hmac / ids
│   ├── ghl.js              read intelligence + write owned CFs + send msgs
│   ├── supabase.js         read events/leads/listings + RW video_jobs/events
│   ├── heygen.js           POST /v2/video/generate
│   ├── fcpxml.js           POST $FCPXML_MCP_URL/render
│   ├── cf-stream.js        copy-from-url + HLS + GIF/thumb URLs
│   ├── cf-images.js        image upload + variants (optional path)
│   ├── r2.js               put/get/passthrough helpers
│   ├── agents.js           Agent Studio invocation + Anthropic/OpenAI fallback
│   ├── delivery.js         SMS/email/conversation orchestration
│   ├── social.js           per-platform dispatch via webhook
│   ├── tracking.js         engagement → scoring_log + GHL CFs
│   ├── queue-consumer.js   post-render: R2 + Stream + delivery branch
│   ├── liveavatar.js       session-token mint + property/contact context builder
│   └── liveavatar-widget.js  templated browser widget JS (LiveKit via SDK)
├── agents/
│   ├── heygen-script-agent.md
│   ├── fcpxml-video-director-agent.md
│   ├── video-delivery-agent.md
│   └── social-content-agent.md
└── migrations/
    ├── 001_video_jobs.sql
    ├── 002_ghl_custom_fields.md
    └── 003_liveavatar_sessions.sql
```

## 4. Isolation guarantees (defence-in-depth)

| Surface                     | Isolation mechanism |
|-----------------------------|---------------------|
| Existing GHL workflows      | Sidecar never POSTs to `/workflows/*`. |
| Existing Ylopo webhooks     | Sidecar reads from `events` table; never registers webhooks. |
| Existing custom fields      | `lib/ghl.js#OWNED_FIELDS` set guards all writes. Anything not in the set is silently dropped. |
| Existing routing            | Sidecar lives at its own domain (`videos.reallistingteam.com`). The proxy never proxies to it. |
| Existing automations        | Sidecar exposes only inbound APIs. It does not subscribe, register, or reroute. |
| Personal videos vs social   | `runDelivery()` refuses `distribution=social`; `runSocialDistribution()` refuses `distribution!=social`. |
| Lead scoring                | Sidecar appends rows to `scoring_log` with `source='ai_video'`. It never updates pre-existing rows. |
| Custom-field collisions     | `migrations/002` includes a pre-flight script to detect existing keys before creating. |
| LiveAvatar (separate product) | Own KV kill-switch key, own Supabase table, own daily rate-limit namespace, own env vars/secret — never shares state with the HEYGEN/FCPXML pipelines. `LIVEAVATAR_ENABLED="false"` by default; see `docs/LIVEAVATAR.md`. |

## 5. Domain plan

| Hostname                          | Bound to             | Purpose                           |
|-----------------------------------|----------------------|-----------------------------------|
| `videos.reallistingteam.com`      | ai-video-system      | Hosted player pages + tracking    |
| `media.reallistingteam.com`       | ai-video-system      | R2 passthrough (`/media/v|p/...`) |
| `cdn.reallistingteam.com`         | (existing) tlt-image-server | Brand assets (logos, watermarks)  |
| `customer-<UID>.cloudflarestream.com` | Cloudflare Stream    | HLS/DASH playback (proxied by iframe) |
