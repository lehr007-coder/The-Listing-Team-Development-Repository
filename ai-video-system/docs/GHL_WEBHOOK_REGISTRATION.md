# GHL Tag-Trigger Setup

When any of the 12 video-trigger tags is added to a GHL contact, the
worker must receive a `ContactTagUpdate` event and fire the matching
render. There is **one** supported way to wire this up:

## Configure via GHL Workflow (5 minutes, one-time)

GHL's REST API (`POST /webhooks` at `services.leadconnectorhq.com`) is
**only available to Marketplace Apps**. Private-integration / location
API tokens return `404` no matter how the request is shaped — that is
why the `/v1/admin/ghl/webhooks/register` and `/setup` admin endpoints
do not work for this sub-account. The correct path is a GHL Workflow:

1. Open GHL → **Automation → Workflows → Create Workflow** (blank).
2. **Trigger** → "Contact Tag" → choose **Tag Added** → select all 12
   trigger tags (see table below). One trigger, twelve tags is fine.
3. **Action** → "Webhook" → method `POST` → URL:

   **Staging:**
   ```
   https://ai-video-system-staging.lehr007.workers.dev/v1/ghl/webhook?token=<STAGING_PROXY_API_KEY>
   ```

   **Production:**
   ```
   https://videos.reallistingteam.com/v1/ghl/webhook?token=<PROD_PROXY_API_KEY>
   ```
4. Custom JSON body — the worker accepts the default GHL payload, but
   if you need to map fields explicitly use:
   ```json
   {
     "type": "ContactTagUpdate",
     "data": {
       "contact": { "id": "{{contact.id}}" },
       "addedTags": ["{{trigger.tag}}"]
     }
   }
   ```
5. **Save → Publish.**

## Tag -> Video Type Map

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

## Verify

Add `seller-valuation-video` to a test contact in GHL. Within 1-2s:

```bash
curl -s "https://ai-video-system-staging.lehr007.workers.dev/v1/admin/jobs?limit=5" \
  -H "Authorization: Bearer ${PROXY_API_KEY}" | python3 -m json.tool
```

You should see a job with `video_type: "seller_valuation"` and the
contact id. If nothing appears, check GHL -> Workflows -> your workflow
-> **Execution Logs**; a 401 from the worker means the `?token=` value
is wrong, a 200 with `skipped: true` means GHL's payload shape wasn't
recognized (capture it and patch `extractContactId`/`extractAddedTags`
in `routes/ghl_webhook.js`).

## How it works end-to-end

1. Any tag from the table is added to a GHL contact.
2. GHL Workflow fires a webhook POST to `/v1/ghl/webhook?token=...`.
3. Worker validates the token, matches the tag -> `video_type`, and
   dispatches `POST /v1/heygen/render` (self-fetch).
4. HeyGen renders (2-4 min), then fires our `/v1/heygen/callback`.
5. Worker delivers the video via email/SMS to the contact.

Idempotency, rate-limits, and the cron poll-fallback all apply
unchanged from the workflow path.
