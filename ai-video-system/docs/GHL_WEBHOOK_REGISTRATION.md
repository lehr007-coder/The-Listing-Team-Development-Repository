# GHL Outbound Webhook Registration

One curl command replaces all 12 GHL workflows.

When a video-trigger tag is added to any GHL contact the worker receives
a `ContactTagUpdate` event and automatically fires the right render.

## Step 1 — Get your PROXY_API_KEY

From your Mac terminal (replace with your actual key — already set in
Cloudflare as a secret):

```
curl -s https://videos.reallistingteam.com/v1/health | python3 -m json.tool
```

Or find it in Cloudflare Dashboard → Workers → ai-video-system →
Settings → Variables & Secrets.

## Step 2 — Register the webhook (run once from your Mac)

```bash
PROXY_API_KEY="<your PROXY_API_KEY from Cloudflare Workers secrets>"
GHL_TOKEN="<your GHL private integration bearer token>"
GHL_LOCATION_ID="SeZr4YCwEZ50IcWqylkQ"

curl -s -X POST "https://services.leadconnectorhq.com/webhooks" \
  -H "Authorization: Bearer ${GHL_TOKEN}" \
  -H "Version: 2021-07-28" \
  -H "Content-Type: application/json" \
  -d "{
    \"locationId\": \"${GHL_LOCATION_ID}\",
    \"name\": \"AI Video — Tag Trigger\",
    \"url\": \"https://videos.reallistingteam.com/v1/ghl/webhook?token=${PROXY_API_KEY}\",
    \"events\": [\"ContactTagUpdate\"]
  }" | python3 -m json.tool
```

> **GHL_TOKEN**: use the private integration key for the sub-account, NOT
> the agency API key.  In GHL: Settings → Integrations → Private
> Integrations → the integration that owns the `ai_video_*` custom fields.

A successful response returns a webhook object with an `id`.  Save that
id — you'll need it if you ever want to update or delete the webhook.

## Step 3 — Test it

Add any of the tags below to a test contact in GHL.  Within seconds the
worker should create a render job.  Check:

```
curl -s "https://videos.reallistingteam.com/v1/admin/jobs?limit=5" \
  -H "Authorization: Bearer ${PROXY_API_KEY}"
```

## Tag → Video Type Map

| GHL Tag | Video Type | Channels | Priority |
|---------|-----------|----------|----------|
| `seller-valuation-video` | seller_valuation | email, sms | 70 |
| `fsbo-prospect` | fsbo_outreach | email, sms | 75 |
| `expired-listing` | expired_listing | email, sms | 80 |
| `active-buyer` | buyer_activity | email, sms | 65 |
| `new-match-video` | new_listing_match | email | 60 |
| `market-update-video` | market_update | email | 40 |
| `open-house-invite-video` | open_house_invite | email, sms | 55 |
| `showing-request-video` | showing_request | sms, email | 75 |
| `appointment-reminder-video` | appointment_reminder | sms | 85 |
| `mortgage-update-video` | mortgage_update | email, sms | 65 |
| `nurture-video` | lead_nurture | email | 35 |
| `priority-lead-video` | priority_lead | sms, email | 95 |

## How it works

1. Any tag from the table above is added to a GHL contact
2. GHL fires `ContactTagUpdate` to `https://videos.reallistingteam.com/v1/ghl/webhook?token=...`
3. Worker maps tag → video_type and dispatches `POST /v1/heygen/render`
4. HeyGen renders the video (2–4 min)
5. HeyGen fires its webhook to `/v1/heygen/callback`
6. Worker delivers the video via email/SMS to the contact

Idempotency: if a tag is re-added to a contact that already has an
active job for that video type, the render is skipped (deduped).

Rate limits still apply: 3 renders per contact per day, 100 per location
per day.

## Removing a webhook

```bash
curl -X DELETE "https://services.leadconnectorhq.com/webhooks/<webhook-id>" \
  -H "Authorization: Bearer ${GHL_TOKEN}" \
  -H "Version: 2021-07-28"
```
