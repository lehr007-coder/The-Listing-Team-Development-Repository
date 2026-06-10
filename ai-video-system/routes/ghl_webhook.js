// GHL outbound webhook handler — replaces 12 individual GHL workflows.
//
// GHL fires ContactTagUpdate events whenever a tag is added or removed
// from a contact. This handler maps recognised "video trigger" tags to
// the appropriate video_type and fires a render via self-fetch to
// POST /v1/heygen/render — the same path a native GHL workflow would use.
//
// Authentication: GHL does not sign webhooks with HMAC.  We require a
// ?token= query parameter whose value must equal env.PROXY_API_KEY.
// The URL is registered once (see docs/GHL_WEBHOOK_REGISTRATION.md)
// and the token never appears in GHL contacts/conversations.
//
// Route (unauthenticated at middleware level, validated here):
//   POST /v1/ghl/webhook?token=<PROXY_API_KEY>
//
// GHL webhook subscription events: ContactTagUpdate

import { json, error } from "../lib/util.js";

// Maps GHL tag → render parameters.  The tag must be ADDED (not just
// present) to trigger a render — see extractAddedTags() below.
const TAG_VIDEO_MAP = {
  "seller-valuation-video":    { video_type: "seller_valuation",     priority_score: 70,  delivery_channels: ["email", "sms"] },
  "fsbo-prospect":             { video_type: "fsbo_outreach",        priority_score: 75,  delivery_channels: ["email", "sms"] },
  "expired-listing":           { video_type: "expired_listing",      priority_score: 80,  delivery_channels: ["email", "sms"] },
  "active-buyer":              { video_type: "buyer_activity",       priority_score: 65,  delivery_channels: ["email", "sms"] },
  "new-match-video":           { video_type: "new_listing_match",    priority_score: 60,  delivery_channels: ["email"] },
  "market-update-video":       { video_type: "market_update",        priority_score: 40,  delivery_channels: ["email"] },
  "open-house-invite-video":   { video_type: "open_house_invite",    priority_score: 55,  delivery_channels: ["email", "sms"] },
  "showing-request-video":     { video_type: "showing_request",      priority_score: 75,  delivery_channels: ["sms", "email"] },
  "appointment-reminder-video":{ video_type: "appointment_reminder", priority_score: 85,  delivery_channels: ["sms"] },
  "mortgage-update-video":     { video_type: "mortgage_update",      priority_score: 65,  delivery_channels: ["email", "sms"] },
  "nurture-video":             { video_type: "lead_nurture",         priority_score: 35,  delivery_channels: ["email"] },
  "priority-lead-video":       { video_type: "priority_lead",        priority_score: 95,  delivery_channels: ["sms", "email"] },
};

export default async function ghlWebhookRoute(request, env, ctx, url) {
  if (request.method !== "POST") {
    return error(405, "method_not_allowed", "POST only");
  }

  // Token auth — must match PROXY_API_KEY
  const token = url.searchParams.get("token");
  if (!token || token !== env.PROXY_API_KEY) {
    return error(401, "unauthorized", "missing or invalid token");
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, "bad_json");
  }

  // GHL fires many event types; only process tag updates. Match
  // ContactTagUpdate exactly (case-insensitive). The Make.com forwarder
  // sets this type explicitly; a native GHL custom-webhook action that
  // omits the type but still carries tags is also accepted below.
  const eventType = (body?.type || body?.event || "").toLowerCase();
  const looksLikeTagEvent =
    eventType === "contacttagupdate" ||
    (eventType === "" && extractAddedTags(body).length > 0);
  if (!looksLikeTagEvent) {
    return json({ ok: true, skipped: true, reason: "not a tag event", type: body?.type || body?.event || "" });
  }

  const contactId = extractContactId(body);
  if (!contactId) {
    return json({ ok: true, skipped: true, reason: "no contact_id in payload" });
  }

  const addedTags = extractAddedTags(body);
  if (addedTags.length === 0) {
    return json({ ok: true, skipped: true, reason: "no added tags in payload" });
  }

  // Find the first matching video trigger tag (process one per event)
  const matched = addedTags
    .map(tag => ({ tag, config: TAG_VIDEO_MAP[tag] }))
    .find(x => x.config != null);

  if (!matched) {
    return json({ ok: true, skipped: true, reason: "no video trigger tag matched", tags: addedTags });
  }

  const { tag, config } = matched;

  // Dispatch render via self-fetch so it runs in its own CPU budget
  ctx.waitUntil(
    fetch(`${env.BASE_URL}/v1/heygen/render`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.PROXY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contact_id: contactId,
        video_type: config.video_type,
        trigger_reason: `GHL tag added: ${tag}`,
        priority_score: config.priority_score,
        delivery_channels: config.delivery_channels,
      }),
    })
      .then(async r => {
        const resBody = await r.json().catch(() => ({}));
        if (!r.ok) {
          throw new Error(`render returned ${r.status}: ${resBody?.message || resBody?.error || "unknown"}`);
        }
        return resBody;
      })
      .then(res => console.log(`ghl-webhook: dispatched ${config.video_type} for ${contactId}`, JSON.stringify({
        tag,
        job_id: res.job_id,
        deduped: res.deduped,
        status: res.status,
      })))
      .catch(e => console.error(`ghl-webhook: render dispatch failed for ${contactId}:`, e.message))
  );

  return json({ ok: true, contact_id: contactId, tag, video_type: config.video_type, queued: true });
}

// ── Payload shape helpers ──────────────────────────────────────────────────
//
// GHL webhook shapes vary by version and event type. Handle all known forms.

function extractContactId(body) {
  // v2 shape: { data: { contact: { id }, id } } or { data: { id } }
  // v1 shape: { contactId } or { contact_id } or { id }
  return (
    body?.data?.contact?.id ||
    body?.data?.id ||
    body?.contactId ||
    body?.contact_id ||
    (body?.id && body?.type ? null : body?.id) || // top-level id is event id, not contact
    null
  );
}

function extractAddedTags(body) {
  // GHL's ContactTagUpdate event carries the contact's FULL current tag
  // list, not an added/removed delta — so we consider the whole list and
  // lean on the per-contact/per-video-type dedupe in /v1/heygen/render to
  // stop a tag-removal event from re-rendering tags still on the contact.
  // Sources, most-specific first:
  //   - explicit addedTags/added_tags (if a future GHL shape provides them)
  //   - the full tag list under data.contact.tags / data.tags / tags
  // Each source may be a real array OR a comma/space-joined string (the form
  // the Make.com HTTP forwarder emits when it coerces {{tags}} into JSON).
  const sources = [
    body?.data?.addedTags,
    body?.data?.added_tags,
    body?.addedTags,
    body?.added_tags,
    body?.data?.contact?.tags,
    body?.data?.tags,
    body?.tags,
  ];

  for (const src of sources) {
    if (Array.isArray(src) && src.length > 0) {
      return src.map(String);
    }
    if (typeof src === "string" && src.trim()) {
      return src.split(/\s*,\s*/).map(s => s.trim()).filter(Boolean);
    }
  }

  return [];
}
