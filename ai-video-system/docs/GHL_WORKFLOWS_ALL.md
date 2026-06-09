# GHL Workflows — All 12 Video Types

Complete webhook payloads and configuration for every video type supported
by the AI Video System. Each section maps directly to one GHL workflow.

All workflows share the same authentication header:

```
Authorization: Bearer <PROXY_API_KEY>
Content-Type: application/json
```

Get the current `PROXY_API_KEY` from:
```
GET https://videos.reallistingteam.com/v1/health
```
(value is in the response body) or from Cloudflare Workers → `ai-video-system` → Settings → Variables & Secrets.

---

## Folder Structure in GHL

Create a single folder called **`AI Video — Sidecar`** and put every
workflow below inside it. This keeps them visually grouped and ensures they
never accidentally touch existing TOS / pipeline workflows.

---

## Common Workflow Steps (all 12 workflows)

Every workflow follows the same 3-step pattern:

**Step 1 — Submit render** (immediate, on trigger)
```
POST https://videos.reallistingteam.com/v1/heygen/render
```

**Step 2 — Wait 10 minutes**
(HeyGen renders in 2–4 min; 10 min allows for queue depth and credit delays.
The webhook fires automatically on completion — this step is a belt-and-suspenders
fallback. By the time the wait finishes, delivery has already happened ≥99% of the time.)

**Step 3 — Send delivery** (belt-and-suspenders fallback)
```
POST https://videos.reallistingteam.com/v1/delivery/send
Body: { "job_id": "{{custom_value.ai_video_job_id}}" }
```

**Optional Step 4 — Archive to R2** (after 12h wait)
```
POST https://videos.reallistingteam.com/v1/admin/jobs/{{custom_value.ai_video_job_id}}/archive
```
Copies the MP4 from HeyGen's CDN to R2. The email link keeps working forever
instead of breaking after ~24h when HeyGen's URL expires.

---

## 1. Seller Valuation

**GHL Workflow Name:** `AI Video — Seller Valuation`

**Trigger options:**
- Contact tag added: `seller-valuation-video`
- Custom field updated: `home_valuation_requested = true`
- Opportunity stage changed to: `Valuation Requested`

**Step 1 Webhook Body:**
```json
{
  "contact_id": "{{contact.id}}",
  "video_type": "seller_valuation",
  "trigger_reason": "Seller requested home valuation — {{workflow.name}}",
  "delivery_channels": ["email", "sms"],
  "priority_score": "70"
}
```

**Save response field:** `job_id` → workflow custom value `ai_video_job_id`

**Use case:** Homeowner expressed interest in knowing what their home is worth.
The AI generates a personalized market analysis video referencing their
neighborhood and recent comparable sales from their lead intelligence profile.

---

## 2. FSBO Outreach

**GHL Workflow Name:** `AI Video — FSBO Outreach`

**Trigger options:**
- Contact tag added: `fsbo-prospect`
- Custom field updated: `lead_source = FSBO`
- Inbound webhook from FSBO data provider

**Step 1 Webhook Body:**
```json
{
  "contact_id": "{{contact.id}}",
  "video_type": "fsbo_outreach",
  "trigger_reason": "FSBO prospect identified — {{workflow.name}}",
  "delivery_channels": ["email", "sms"],
  "priority_score": "75"
}
```

**Use case:** Contact is trying to sell their home without an agent.
Video focuses on the value of professional representation, staging,
and marketing reach — personalized to their specific property type/area.

---

## 3. Expired Listing

**GHL Workflow Name:** `AI Video — Expired Listing`

**Trigger options:**
- Contact tag added: `expired-listing`
- Custom field updated: `lead_source = Expired Listing`
- Inbound webhook from MLS data feed on listing expiration

**Step 1 Webhook Body:**
```json
{
  "contact_id": "{{contact.id}}",
  "video_type": "expired_listing",
  "trigger_reason": "Listing expired — {{workflow.name}}",
  "delivery_channels": ["email", "sms"],
  "priority_score": "80"
}
```

**Use case:** Listing expired without selling. High-intent seller who is
likely frustrated. Video addresses what went wrong and how a different
approach (pricing, marketing, staging) achieves a sale.

---

## 4. Buyer Activity

**GHL Workflow Name:** `AI Video — Buyer Activity`

**Trigger options:**
- Contact tag added: `active-buyer`
- Ylopo: saved search created or multiple listings viewed
- Custom field updated: `buyer_status = active`

**Step 1 Webhook Body:**
```json
{
  "contact_id": "{{contact.id}}",
  "video_type": "buyer_activity",
  "trigger_reason": "Active buyer engagement — {{workflow.name}}",
  "delivery_channels": ["email", "sms"],
  "priority_score": "65"
}
```

**Use case:** Lead is actively browsing listings. Video acknowledges
their search activity, highlights what makes their target area competitive,
and positions the agent as the expert resource to tour and offer fast.

---

## 5. New Listing Match

**GHL Workflow Name:** `AI Video — New Listing Match`

**Trigger options:**
- Ylopo new listing alert sent to contact
- Custom field updated: `new_match_alert_sent = true`
- Contact tag added: `new-match-video`

**Step 1 Webhook Body:**
```json
{
  "contact_id": "{{contact.id}}",
  "video_type": "new_listing_match",
  "trigger_reason": "New listing match alert — {{workflow.name}}",
  "delivery_channels": ["email"],
  "priority_score": "60"
}
```

**Use case:** A property just hit the market that matches the buyer's
saved search criteria. Video introduces the property with urgency
("this type of home moves fast in this market") and encourages booking a tour.

---

## 6. Market Update

**GHL Workflow Name:** `AI Video — Market Update`

**Trigger options:**
- Time-based: 1st of each month (cron workflow)
- Contact tag added: `market-update-video`
- Manual trigger for warm database contacts

**Step 1 Webhook Body:**
```json
{
  "contact_id": "{{contact.id}}",
  "video_type": "market_update",
  "trigger_reason": "Monthly market update — {{workflow.name}}",
  "delivery_channels": ["email"],
  "priority_score": "40"
}
```

**Use case:** Regular nurture touchpoint for leads not yet ready to
transact. Keeps the agent top-of-mind with useful local market data —
inventory levels, days-on-market, median price trends for their area.

---

## 7. Open House Invite

**GHL Workflow Name:** `AI Video — Open House Invite`

**Trigger options:**
- Open house scheduled in GHL (custom field: `open_house_date` set)
- Contact tag added: `open-house-invite-video`
- Opportunity stage: `Open House Scheduled`

**Step 1 Webhook Body:**
```json
{
  "contact_id": "{{contact.id}}",
  "video_type": "open_house_invite",
  "trigger_reason": "Open house scheduled — {{workflow.name}}",
  "delivery_channels": ["email", "sms"],
  "priority_score": "55"
}
```

**Use case:** Personalized invitation to an upcoming open house.
Video creates urgency and social proof ("we had 12 showings last week,
open houses at this price point fill up fast").

---

## 8. Showing Request

**GHL Workflow Name:** `AI Video — Showing Request`

**Trigger options:**
- Contact tag added: `showing-request-video`
- Opportunity stage: `Showing Scheduled`
- Custom field: `showing_requested = true`

**Step 1 Webhook Body:**
```json
{
  "contact_id": "{{contact.id}}",
  "video_type": "showing_request",
  "trigger_reason": "Showing requested — {{workflow.name}}",
  "delivery_channels": ["sms", "email"],
  "priority_score": "75"
}
```

**Use case:** Buyer has requested a showing. Video confirms the showing,
sets expectations for the tour, and pre-frames what to look for in the
property — builds excitement and reduces cancellation rate.

---

## 9. Appointment Reminder

**GHL Workflow Name:** `AI Video — Appointment Reminder`

**Trigger options:**
- Time-based: 24 hours before appointment (use GHL appointment trigger)
- Contact tag added: `appointment-reminder-video`
- Appointment status: `Confirmed`

**Step 1 Webhook Body:**
```json
{
  "contact_id": "{{contact.id}}",
  "video_type": "appointment_reminder",
  "trigger_reason": "Appointment reminder — 24h before — {{workflow.name}}",
  "delivery_channels": ["sms"],
  "priority_score": "85"
}
```

**Use case:** 24-hour reminder before a consultation, showing, or listing
appointment. SMS-first delivery. Video is warm, personal, confirms logistics,
and reduces no-show rate significantly.

---

## 10. Mortgage Update

**GHL Workflow Name:** `AI Video — Mortgage Update`

**Trigger options:**
- Rate change alert (external webhook from rate monitor)
- Contact tag added: `mortgage-update-video`
- Custom field: `rate_alert_triggered = true`

**Step 1 Webhook Body:**
```json
{
  "contact_id": "{{contact.id}}",
  "video_type": "mortgage_update",
  "trigger_reason": "Mortgage rate change alert — {{workflow.name}}",
  "delivery_channels": ["email", "sms"],
  "priority_score": "65"
}
```

**Use case:** Interest rates moved meaningfully. Video explains how the
shift affects the contact's specific buying power or refinance opportunity,
using their lead profile (price range, pre-approval status) for context.

---

## 11. Lead Nurture

**GHL Workflow Name:** `AI Video — Lead Nurture`

**Trigger options:**
- Time-based: 30/60/90 day drip for inactive leads
- Contact tag added: `nurture-video`
- No activity for 14+ days (inactivity trigger)

**Step 1 Webhook Body:**
```json
{
  "contact_id": "{{contact.id}}",
  "video_type": "lead_nurture",
  "trigger_reason": "Lead nurture drip — {{workflow.name}}",
  "delivery_channels": ["email"],
  "priority_score": "35"
}
```

**Use case:** General relationship-maintenance video for leads in the
long-term nurture phase. Keeps the agent visible without being pushy.
AI script adapts to the lead's last known activity and interest area.

---

## 12. Priority Lead

**GHL Workflow Name:** `AI Video — Priority Lead`

**Trigger options:**
- Ylopo priority score spike (RAIYA hot lead alert)
- Contact tag added: `priority-lead-video`
- Custom field: `lead_priority = high`
- Opportunity stage: `Hot Lead`

**Step 1 Webhook Body:**
```json
{
  "contact_id": "{{contact.id}}",
  "video_type": "priority_lead",
  "trigger_reason": "Priority lead identified — {{workflow.name}}",
  "delivery_channels": ["sms", "email"],
  "priority_score": "95"
}
```

**Use case:** Lead showed strong buying signals — multiple saves, repeated
visits to the same listing, or RAIYA flagged them as high intent.
Video is urgent and action-oriented, personalizing to their exact search
behavior. SMS is lead channel (fastest open rate).

---

## Delivery Channels Reference

| Channel | Field Value | GHL Action |
|---------|-------------|------------|
| `email` | "email" | Sends branded HTML email via GHL Conversations API |
| `sms` | "sms" | Sends SMS via GHL Conversations API |
| `conversation` | "conversation" | Appends note to GHL conversation feed (no push notification) |

Combine channels as an array: `["email", "sms"]`

---

## Per-Type Priority Score Guide

| Video Type | Default Score | Rationale |
|------------|--------------|-----------|
| `priority_lead` | 95 | Highest-intent signal, immediate action needed |
| `appointment_reminder` | 85 | Time-sensitive, high cancellation-prevention value |
| `expired_listing` | 80 | Frustrated motivated seller, competitive window |
| `fsbo_outreach` | 75 | DIY seller likely to reconsider after strong outreach |
| `showing_request` | 75 | Buyer in active mode, reduce cancellation |
| `seller_valuation` | 70 | High intent but not yet committed |
| `mortgage_update` | 65 | Market-event driven, moderate urgency |
| `buyer_activity` | 65 | Active but not yet committed to agent |
| `open_house_invite` | 55 | Event-driven, moderate urgency |
| `new_listing_match` | 60 | Automated, moderate urgency |
| `market_update` | 40 | Nurture touchpoint, low urgency |
| `lead_nurture` | 35 | Long-term drip, lowest urgency |

---

## Staging Testing

Swap the URL host to test any workflow without consuming HeyGen credits:

```
https://videos.reallistingteam.com → https://ai-video-system-staging.lehr007.workers.dev
```

Staging renders are watermarked sample videos (`test: true` in HeyGen API).
Same auth key. Same response shape. Full pipeline exercised end-to-end.

---

## Rate Limit Reference

Three daily limits protect against runaway spend:

| Limit | Default | Env Var |
|-------|---------|---------|
| Global renders/day | 100 | `DAILY_RENDER_LIMIT` |
| Per contact/day | 3 | `PER_CONTACT_DAILY_LIMIT` |
| Per GHL location/day | 50 | `PER_LOCATION_DAILY_LIMIT` |

If you hit a 429, check `GET /v1/admin/health-deep` for current counters.
All limits reset at midnight UTC. Use `DELETE /v1/admin/kill` to halt all
new renders immediately without touching the limits.
