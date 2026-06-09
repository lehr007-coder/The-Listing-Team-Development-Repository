# AI Video System — Operations Playbook

Reference guide for day-to-day operations, incident response, and
maintenance. All API calls use production by default — swap the host to
`ai-video-system-staging.lehr007.workers.dev` for staging.

**Auth:** All `/v1/*` endpoints require the header:
```
Authorization: Bearer <PROXY_API_KEY>
```
Get the current key from Cloudflare Workers → `ai-video-system` → Settings →
Variables & Secrets → `PROXY_API_KEY`, or from `GET /v1/health`.

---

## Quick Reference

| What you need | Command |
|---------------|---------|
| Check all upstream health | `GET /v1/health` or `GET /v1/admin/health-deep` |
| List recent jobs | `GET /v1/admin/jobs?limit=50` |
| Full detail on one job | `GET /v1/admin/jobs/:id` |
| Why is this job stuck? | `GET /v1/admin/jobs/:id/diagnose` |
| Re-trigger a failed render | `POST /v1/admin/jobs/:id/reprocess` |
| Force delivery on a rendered job | `POST /v1/delivery/send` `{"job_id":"..."}` |
| HeyGen credit balance | `GET /v1/admin/heygen/credits` |
| Current rate limit counters | `GET /v1/admin/rate-limits` |
| 30-day analytics summary | `GET /v1/admin/analytics/summary?days=30` |
| Send the weekly report now | `POST /v1/admin/reports/weekly/send` |
| Preview the weekly report (no email) | `POST /v1/admin/reports/weekly/send` body `{"dry_run":true}` |
| Kill switch — halt ALL new renders | `DELETE /v1/admin/kill` |
| Resume after kill switch | `POST /v1/admin/kill` |
| Browser dashboard | `https://videos.reallistingteam.com/admin` |

---

## Runbooks

### Job Stuck in `rendering`

A job stays in `rendering` when HeyGen completed the render but the
account-level webhook never fired (observed ~1% of renders).

**Step 1 — Diagnose:**
```bash
curl -s -H "Authorization: Bearer <KEY>" \
  https://videos.reallistingteam.com/v1/admin/jobs/<JOB_ID>/diagnose | jq .
```

**Step 2a — If HeyGen shows `completed` but job is `rendering`:**

The cron fallback should catch this within 1 minute. If you need to force
it immediately:
```bash
curl -s -X POST -H "Authorization: Bearer <KEY>" \
  https://videos.reallistingteam.com/v1/admin/jobs/<JOB_ID>/reprocess | jq .
```

**Step 2b — If job is still `rendering` after reprocess (claim race lost):**

Use `sync: true` to bypass the claim lock (admin path, safe to use):
```bash
curl -s -X POST \
  -H "Authorization: Bearer <KEY>" \
  -H "Content-Type: application/json" \
  -d '{"sync": true}' \
  https://videos.reallistingteam.com/v1/admin/jobs/<JOB_ID>/reprocess | jq .
```

**Step 2c — If HeyGen shows `failed` (not `completed`):**

HeyGen render failed — typically credits exhausted or template error.
Check credits:
```bash
curl -s -H "Authorization: Bearer <KEY>" \
  https://videos.reallistingteam.com/v1/admin/heygen/credits | jq .
```
Top up credits in the HeyGen dashboard, then reprocess once HeyGen finishes
(if still in queue) or re-submit via `POST /v1/heygen/render`.

---

### Delivery Failed (job is `rendered` but email never arrived)

**Check delivery results:**
```bash
curl -s -H "Authorization: Bearer <KEY>" \
  https://videos.reallistingteam.com/v1/admin/jobs/<JOB_ID> | jq '.delivery_results'
```

**Force re-delivery:**
```bash
curl -s -X POST \
  -H "Authorization: Bearer <KEY>" \
  -H "Content-Type: application/json" \
  -d '{"job_id": "<JOB_ID>"}' \
  https://videos.reallistingteam.com/v1/delivery/send | jq .
```

Note: `/v1/delivery/send` is idempotent — if the job is already `delivered`,
it returns `ok: true` without re-sending. This is safe to call repeatedly.

If delivery returns an error about `no hosted_url`, the render never
completed. Reprocess first, then retry delivery after the job reaches
`status: rendered`.

---

### Video Link Broke (HeyGen URL Expired ~24h After Render)

HeyGen CDN URLs expire ~24h after render. To permanently preserve the video:

**Archive to R2:**
```bash
curl -s -X POST \
  -H "Authorization: Bearer <KEY>" \
  -H "Content-Type: application/json" \
  -d '{}' \
  https://videos.reallistingteam.com/v1/admin/jobs/<JOB_ID>/archive | jq .
```

This copies the MP4 to R2 and rewrites `r2_url` so the hosted page
at `/v/<JOB_ID>` serves from R2 going forward. The already-sent email
link (`/v/<JOB_ID>`) will start working again after archive completes.

**R2 lifecycle:** MP4 files in R2 do not auto-expire. Run the archive
endpoint selectively for videos that need long-term persistence (e.g.,
for leads who haven't opened the email yet).

---

### HeyGen Credits Running Low

**Check balance:**
```bash
curl -s -H "Authorization: Bearer <KEY>" \
  https://videos.reallistingteam.com/v1/admin/heygen/credits | jq .
```

**What each field means:**
- `remaining_credits` — API credits used for on-demand generation (not template renders)
- `subscription_credits_remaining` — main monthly plan credits (what template renders consume)

Template renders (what every GHL workflow uses) consume `subscription_credits`.
Top up from HeyGen dashboard → Billing. Credits reset on the subscription renewal date.

**Pre-emptive kill-switch:** If you want to pause all new renders while
credits are topped up without cancelling in-flight jobs:
```bash
# Pause new renders
curl -s -X DELETE -H "Authorization: Bearer <KEY>" \
  https://videos.reallistingteam.com/v1/admin/kill | jq .

# Resume when credits are restored
curl -s -X POST -H "Authorization: Bearer <KEY>" \
  https://videos.reallistingteam.com/v1/admin/kill | jq .
```

---

### Rate Limits Hit (429 from `/v1/heygen/render`)

**Check current counters:**
```bash
curl -s -H "Authorization: Bearer <KEY>" \
  https://videos.reallistingteam.com/v1/admin/rate-limits | jq .
```

All three limits reset at midnight UTC. If a workflow is legitimately
generating more volume than the defaults allow:

**Temporary override via Cloudflare dashboard:**
Go to Workers → `ai-video-system` → Settings → Variables & Secrets, then
update the relevant env var (changes take effect on next request, no redeploy needed):

| Variable | Default | When to increase |
|----------|---------|-----------------|
| `DAILY_RENDER_LIMIT` | 100 | Running large batch campaigns |
| `PER_CONTACT_DAILY_LIMIT` | 3 | A/B testing multi-video sequences |
| `PER_LOCATION_DAILY_LIMIT` | 50 | Multi-location deployment with high volume |

---

### Re-Render a Specific Job (Re-Do Everything from Scratch)

To completely re-render a job with a fresh HeyGen submission (burns 1 credit):

```bash
# First, delete or mark old job as failed so the idempotency check doesn't block
curl -s -X PATCH \
  -H "Authorization: Bearer <KEY>" \
  -H "Content-Type: application/json" \
  -d '{"status": "failed"}' \
  https://videos.reallistingteam.com/v1/admin/jobs/<JOB_ID> | jq .

# Then re-submit as if it's a new request
curl -s -X POST \
  -H "Authorization: Bearer <KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "contact_id": "<CONTACT_ID>",
    "video_type": "<VIDEO_TYPE>",
    "trigger_reason": "manual re-render",
    "delivery_channels": ["email"]
  }' \
  https://videos.reallistingteam.com/v1/heygen/render | jq .
```

---

### Kill Switch — Halt All New Renders Immediately

Use this when HeyGen credits are nearly exhausted or a misconfigured
workflow is looping.

```bash
# Halt — new render requests return HTTP 503 immediately
curl -s -X DELETE -H "Authorization: Bearer <KEY>" \
  https://videos.reallistingteam.com/v1/admin/kill | jq .

# Check kill switch state
curl -s -H "Authorization: Bearer <KEY>" \
  https://videos.reallistingteam.com/v1/health | jq '.kill_switch'

# Resume (clear the kill switch)
curl -s -X POST -H "Authorization: Bearer <KEY>" \
  https://videos.reallistingteam.com/v1/admin/kill | jq .
```

In-flight jobs (already submitted to HeyGen) continue to completion
after the kill switch is set — it only blocks new `/v1/heygen/render`
submissions.

---

### Webhook Debug — Why Isn't the Callback Firing?

```bash
# All webhook arrivals (success + failure) for the last 24h
curl -s -H "Authorization: Bearer <KEY>" \
  "https://videos.reallistingteam.com/v1/heygen/webhooks/debug?limit=50" | jq .

# Filter to a specific job
curl -s -H "Authorization: Bearer <KEY>" \
  "https://videos.reallistingteam.com/v1/heygen/webhooks/debug?job_id=<JOB_ID>" | jq .
```

Common failure modes:
- `signature_error: verification_failed` — HeyGen changed their HMAC signing format; check `HEYGEN_CALLBACK_SECRET`
- `missing_job_id` — callback arrived but `callback_id` field was null (HeyGen v2 bug); cron fallback will catch it within 1 min
- Entry completely absent — HeyGen never fired the webhook; cron fallback will catch it within 1 min

---

### Deploy New Code

**Staging (automatic on push to `main`):**
Any merge to `main` deploys to staging automatically via GitHub Actions.

**Production (manual approval required):**
```
GitHub → Actions → Deploy AI Video System (Production) → Run workflow
→ Input: confirm = "DEPLOY"
```

Production deploy requires the `DEPLOY` confirmation to prevent
accidental deployments. Takes ~2 minutes to propagate globally.

**Verify production after deploy:**
```bash
curl -s https://videos.reallistingteam.com/v1/health | jq .
curl -s -H "Authorization: Bearer <KEY>" \
  https://videos.reallistingteam.com/v1/admin/health-deep | jq .
```

---

### Rotate the PROXY_API_KEY

1. Generate a new key:
   ```bash
   openssl rand -hex 32
   ```
2. Update in Cloudflare Workers → `ai-video-system` → Settings → Variables & Secrets → `PROXY_API_KEY`
3. Update `ai-video-system-staging` with the same or a different key
4. Update the key in every GHL workflow webhook header (Step 1 of each workflow)
5. Update any external services that call the API directly
6. The old key is invalid immediately — no deploy needed

---

## Monitoring

### Logs

Production Worker logs: Cloudflare Dashboard → Workers → `ai-video-system` → Logs

Key log patterns to watch:
- `processOne <id> DONE` — successful end-to-end completion
- `processOne <id> ENTER step=` — track which step a job is on
- `poll-fallback: recovered=` — how many stuck jobs the cron rescued each minute
- `callback <id>: marked rendered` — webhook fired and job moved forward
- `callback delivery self-fetch failed` — delivery failed after successful render (check GHL API token)

### Health Check URL (for uptime monitors)

```
GET https://videos.reallistingteam.com/v1/health
```

Returns `200 { ok: true }` when the worker is running. No auth required.
Wire this into StatusCake / UptimeRobot / Cloudflare Health Checks.

### Deep Health (upstream dependencies)

```bash
curl -s -H "Authorization: Bearer <KEY>" \
  https://videos.reallistingteam.com/v1/admin/health-deep | jq .
```

Shows boolean flags for every upstream credential configured:
`heygen_ok`, `supabase_ok`, `ghl_ok`, `anthropic_ok`, `r2_ok`,
`kv_ok`, `stream_ok`, `cf_images_ok`.

---

## Database (Supabase)

**Project:** `ylopo-intelligence` (project ID `tglbjiehyfyrefxwgmzz`)

**Key tables:**
- `video_jobs` — one row per render request, tracks full lifecycle
- `video_events` — append-only event log per job (rendered, sent_email, etc.)

**Useful queries:**

```sql
-- Jobs in last 24h
SELECT id, contact_id, video_type, status, created_at, delivered_at, error
FROM video_jobs
WHERE created_at > now() - interval '24 hours'
ORDER BY created_at DESC;

-- Stuck rendering jobs (older than 10 min, should have been caught by cron)
SELECT id, heygen_video_id, created_at, last_event
FROM video_jobs
WHERE status = 'rendering'
  AND render_engine = 'HEYGEN'
  AND created_at < now() - interval '10 minutes'
ORDER BY created_at DESC;

-- Delivery failure rate
SELECT
  date_trunc('day', created_at) as day,
  count(*) filter (where status = 'delivered') as delivered,
  count(*) filter (where status = 'failed') as failed,
  count(*) as total
FROM video_jobs
WHERE created_at > now() - interval '7 days'
GROUP BY 1 ORDER BY 1;
```

Run via Supabase Dashboard → SQL Editor, or:
```bash
curl -s "https://tglbjiehyfyrefxwgmzz.supabase.co/rest/v1/video_jobs?select=*&order=created_at.desc&limit=20" \
  -H "apikey: <SUPABASE_KEY>" \
  -H "Authorization: Bearer <SUPABASE_KEY>" | jq .
```

---

## Environment Variables Reference

All secrets set via `npx wrangler secret put <NAME>` or Cloudflare dashboard.

| Variable | Required | Description |
|----------|----------|-------------|
| `PROXY_API_KEY` | ✅ | Bearer token for all `/v1/*` API calls |
| `HEYGEN_API_KEY` | ✅ | HeyGen API key |
| `SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_KEY` | ✅ | Supabase service role key |
| `GHL_V2_TOKEN` | ✅ | GHL private integration token (v2 API) |
| `GHL_LOCATION_ID` | ✅ | Primary GHL location ID |
| `ANTHROPIC_API_KEY` | recommended | Claude API for agent script generation |
| `HEYGEN_CALLBACK_SECRET` | recommended | HMAC secret for webhook verification |
| `CF_STREAM_API_TOKEN` | optional | Cloudflare Stream token for video hosting |
| `CF_IMAGES_API_TOKEN` | optional | Cloudflare Images token for thumbnail hosting |
| `CF_IMAGES_ACCOUNT_HASH` | optional | CF Images account hash |
| `OPENAI_API_KEY` | optional | Alternative to Anthropic for agents |
| `AGENT_FALLBACK_PROVIDER` | optional | `anthropic` (default) or `openai` |

**Config vars (set in wrangler.toml, not secrets):**

| Variable | Default | Description |
|----------|---------|-------------|
| `DAILY_RENDER_LIMIT` | 100 | Global renders per day |
| `PER_CONTACT_DAILY_LIMIT` | 3 | Renders per contact per day |
| `PER_LOCATION_DAILY_LIMIT` | 50 | Renders per GHL location per day |
| `WEEKLY_REPORT_CONTACT_IDS` | "" | Comma-separated GHL contact IDs that receive the weekly report email |
| `ENVIRONMENT` | production/staging | Controls HeyGen test mode |
| `BASE_URL` | https://videos.reallistingteam.com | Self-reference for self-fetches |

---

## Weekly Performance Report (Phase 8)

A weekly summary email is sent every Monday at 14:00 UTC (≈9am ET / 10am EDT)
to every GHL contact ID listed in `WEEKLY_REPORT_CONTACT_IDS`. The email
contains last-7-day totals, a daily activity sparkline, and a per-video-type
breakdown with delivery rate and average engagement.

**Configure recipients:**
```bash
# Comma-separated list of GHL contact IDs (max 20)
# Each must be a real contact in your GHL workspace.
wrangler secret put WEEKLY_REPORT_CONTACT_IDS
# Paste: contact_id_1,contact_id_2,contact_id_3
```

**Manual trigger (for testing or off-schedule sends):**
```bash
# Preview only — renders the email + recipient list, no actual send
curl -s -X POST \
  -H "Authorization: Bearer <KEY>" \
  -H "Content-Type: application/json" \
  -d '{"dry_run": true}' \
  https://videos.reallistingteam.com/v1/admin/reports/weekly/send | jq .

# Send now (uses recipients from env)
curl -s -X POST \
  -H "Authorization: Bearer <KEY>" \
  -H "Content-Type: application/json" \
  -d '{}' \
  https://videos.reallistingteam.com/v1/admin/reports/weekly/send | jq .

# Send to specific recipients (overrides env)
curl -s -X POST \
  -H "Authorization: Bearer <KEY>" \
  -H "Content-Type: application/json" \
  -d '{"recipients": ["ghl_contact_id_1", "ghl_contact_id_2"]}' \
  https://videos.reallistingteam.com/v1/admin/reports/weekly/send | jq .

# Custom window (default 7 days)
curl -s -X POST \
  -H "Authorization: Bearer <KEY>" \
  -H "Content-Type: application/json" \
  -d '{"days": 14}' \
  https://videos.reallistingteam.com/v1/admin/reports/weekly/send | jq .
```

**Why GHL conversations API for the report?**
Reuses existing GHL credentials + proven email path. Each recipient must be a
contact in your GHL workspace — typically the broker, ops lead, and any other
stakeholder who already exists as a GHL contact. No new SMTP credentials,
deliverability config, or unsubscribe handling required (GHL owns that).
