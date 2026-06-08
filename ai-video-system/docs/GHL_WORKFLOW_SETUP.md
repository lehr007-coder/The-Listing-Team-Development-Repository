# GHL Workflow: AI Video — Render & Deliver

The Cloudflare-side delivery orchestration (cron + webhook → self-fetch)
turned out to be unreliable in this runtime. The proven-working
architecture is to drive the timing from a GHL workflow that calls our
worker endpoints directly.

Every endpoint used here has been validated end-to-end:

| Endpoint | Proven via |
|----------|------------|
| `POST /v1/heygen/render` | every render call this session |
| `POST /v1/delivery/send` | `vj_mpy9lwvc`, `vj_mpx84ptv` (3 successful runs) |
| `POST /v1/admin/jobs/:id/archive` | minimal — designed to fit CPU budget cleanly |

---

## Workflow

**Folder:** `AI Video — Sidecar` (so the existing TOS / pipeline workflows
are never accidentally touched).

**Name:** `AI Video — Render & Deliver (Production)`

**Trigger:** whatever event you want to send a personalized video on. Common
choices:

- Contact tag added (e.g. `ai-video-request`)
- Opportunity stage change
- Workflow inbound webhook

### Step 1 — Submit render

**Action:** Webhooks → Custom Webhook → POST

- URL: `https://videos.reallistingteam.com/v1/heygen/render`
- Headers:
  - `Authorization: Bearer mNQAeneDVLq2zG1Rk9PFszFZ1OVwdoXFJKnWysEXT48`
  - `Content-Type: application/json`
- Body (JSON):
  ```json
  {
    "contact_id": "{{contact.id}}",
    "video_type": "lead_nurture",
    "trigger_reason": "GHL workflow auto-trigger — {{workflow.name}}",
    "delivery_channels": ["email"]
  }
  ```
- **Save response field** `job_id` to a workflow custom value (call it
  `ai_video_job_id`).

Pick whichever `video_type` matches the situation — any of:
`seller_valuation`, `fsbo_outreach`, `expired_listing`, `buyer_activity`,
`new_listing_match`, `market_update`, `open_house_invite`,
`showing_request`, `appointment_reminder`, `mortgage_update`,
`lead_nurture`, `priority_lead`.

### Step 2 — Wait for HeyGen

**Action:** Wait → 10 minutes

(HeyGen template renders typically complete in 2-4 min. 10 leaves margin
for HeyGen queue depth, and protects against false-positive delivery
attempts when credits are low — HeyGen will accept a job, then stall it
silently until credits free up. The webhook fires automatically when
HeyGen completes the render, updating the job to `status=rendered`
with `hosted_url` set.)

### Step 3 — Send email

**Action:** Webhooks → Custom Webhook → POST

- URL: `https://videos.reallistingteam.com/v1/delivery/send`
- Headers: same auth as step 1
- Body:
  ```json
  {
    "job_id": "{{custom_value.ai_video_job_id}}"
  }
  ```

Response will include `results.email.threadId` + `messageId` from GHL's
own conversations API — visible in the contact's conversation history
right alongside any other emails you send.

> **Safety guard.** As of v2026-06-08, `/v1/delivery/send` refuses to fire
> when `hosted_url` is null. The error message names the failure mode
> explicitly (HeyGen credits / webhook delivery). If you see this in the
> step output, the render never completed — top up HeyGen credits, then
> call `POST /v1/admin/jobs/<id>/reprocess` once HeyGen finishes the
> stuck video.

### Step 4 — Archive to R2 (optional but recommended)

**Action:** Wait → 12 hours
**Then:** Webhooks → Custom Webhook → POST

- URL: `https://videos.reallistingteam.com/v1/admin/jobs/{{custom_value.ai_video_job_id}}/archive`
- Headers: same auth
- Body: empty (or `{}`)

This copies the MP4 from HeyGen's CDN to your R2 bucket and rewrites the
job's `r2_url` so the video link in the already-sent email keeps working
forever instead of breaking after ~24h when HeyGen's URL expires.

---

## Staging variant

For testing, swap the URL host:

- `https://videos.reallistingteam.com` → `https://ai-video-system-staging.lehr007.workers.dev`

Staging uses HeyGen's free `test: true` mode — no API credits burned.
Same auth key. Same response shape. Renders deliver a watermarked sample
video instead of the real script, but the entire pipeline is exercised.

Recommended: clone the production workflow, rename to `AI Video — Render
& Deliver (Staging)`, change URLs, run all changes through staging first.

---

## Why not Cloudflare cron / webhook chains?

Documented in this session: every attempt to chain processing inside
Cloudflare's runtime — queue consumer, scheduled cron, `ctx.waitUntil`,
HTTP-handler self-fetch — exhibited a silent-kill pattern partway through
the pipeline. The HeyGen render itself, individual webhook handlers, and
single-purpose endpoints all work fine in isolation. GHL orchestrating
the steps externally bypasses this entire class of issues.

---

## Endpoints reference

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/heygen/render` | Submit a render job to HeyGen, returns `job_id` |
| GET | `/v1/heygen/jobs/:id` | Read job state (status, urls, error) |
| POST | `/v1/delivery/send` | Send the rendered video as email via GHL |
| POST | `/v1/admin/jobs/:id/archive` | Copy HeyGen MP4 → R2 for permanent storage |
| GET | `/v1/admin/jobs?limit=50` | List recent jobs |
| GET | `/v1/admin/jobs/:id` | Full job detail |
| GET | `/v1/admin/jobs/:id/diagnose` | One-shot diagnostic: why is this job stuck? |
| POST | `/v1/admin/jobs/:id/reprocess` | Re-trigger pipeline (auto-fetches HeyGen status if no URL passed) |
| GET | `/v1/admin/heygen/credits` | HeyGen API credit balance |
| GET | `/admin` | Browser dashboard |

All `/v1/*` paths require `Authorization: Bearer <PROXY_API_KEY>` (or
`X-API-Key: <PROXY_API_KEY>` header).

Hosted page (public, no auth): `/v/:jobId` — the page the email link
points to. Renders the video player + tracking pixel + CTA button.
