// GHL client — READ-ONLY against existing fields, WRITE-ONLY into the
// new ai_video_* / video_* custom fields owned by this sidecar.
//
// Never edits existing automation triggers, workflows, pipelines, or fields
// outside the ai_video_* / video_* / social_content_type namespace.

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";

// Custom field keys this sidecar OWNS (writable). Anything else is read-only.
export const OWNED_FIELDS = new Set([
  "ai_video_type",
  "ai_video_script",
  "ai_video_scene_plan",
  "video_render_engine",
  "video_priority_score",
  "video_trigger_reason",
  "video_status",
  "video_render_job_id",
  "video_url",
  "video_gif_url",
  "video_thumbnail_url",
  "video_last_rendered",
  "video_last_sent",
  "video_delivery_method",
  "video_opened",
  "video_clicked",
  "video_watch_percent",
  "video_engagement_score",
  "social_content_type",
  "worthy_of_social",
  "last_video_type",
  "last_video_cta",
]);

function authHeaders(env, useV2 = true) {
  const token = useV2
    ? (env.GHL_V2_TOKEN || env.GHL_API_KEY)
    : (env.GHL_API_KEY || env.GHL_V2_TOKEN);
  return {
    "Authorization": `Bearer ${token}`,
    "Version": GHL_VERSION,
    "Content-Type": "application/json",
  };
}

export async function getContact(env, contactId) {
  const r = await fetch(`${GHL_BASE}/contacts/${contactId}`, {
    headers: authHeaders(env),
  });
  if (!r.ok) throw new Error(`GHL getContact ${contactId} failed: ${r.status} ${await r.text()}`);
  const data = await r.json();
  return data.contact || data;
}

export function readField(contact, key) {
  const fields = Array.isArray(contact?.customField)
    ? contact.customField
    : Array.isArray(contact?.customFields) ? contact.customFields : [];
  const f = fields.find(x => (x.fieldKey || x.key || x.name) === key
                          || (x.fieldKey || x.key || x.name) === `contact.${key}`);
  return f ? (f.value ?? f.field_value ?? "") : "";
}

// Read all the existing intelligence the script/director agents need.
// Pure read — no mutations.
export function readLeadIntelligence(contact) {
  return {
    contactId: contact.id,
    firstName: contact.firstName || "",
    lastName: contact.lastName || "",
    email: contact.email || "",
    phone: contact.phone || "",
    locationId: contact.locationId,
    tags: contact.tags || [],
    seller_estimated_value: readField(contact, "seller_estimated_value"),
    seller_property_address: readField(contact, "seller_property_address"),
    lead_priority_label: readField(contact, "lead_priority_label"),
    lead_score: readField(contact, "lead_score"),
    last_event_type: readField(contact, "last_event_type"),
    last_event_listing: readField(contact, "last_event_listing"),
    last_event_date: readField(contact, "last_event_date"),
    favorite_listings: readField(contact, "favorite_listings"),
    showing_request_address: readField(contact, "showing_request_address"),
    fsbo_address: readField(contact, "fsbo_address"),
    agent_first_name: readField(contact, "agent_first_name"),
    agent_brand: readField(contact, "agent_brand"),
    // Sidecar-owned video state (so we never re-render unnecessarily)
    last_video_type: readField(contact, "last_video_type"),
    video_status: readField(contact, "video_status"),
    video_render_job_id: readField(contact, "video_render_job_id"),
  };
}

// Write ONLY owned fields. Silently drops any non-owned key as a safety net.
// GHL v2 contact-update accepts `customFields` (plural). v1 used `customField`.
export async function writeOwnedFields(env, contactId, updates) {
  const safeUpdates = {};
  for (const [k, v] of Object.entries(updates || {})) {
    if (OWNED_FIELDS.has(k)) safeUpdates[k] = v == null ? "" : String(v);
  }
  if (Object.keys(safeUpdates).length === 0) return { skipped: true };

  const customFields = Object.entries(safeUpdates).map(([key, field_value]) => ({
    key, field_value,
  }));

  const r = await fetch(`${GHL_BASE}/contacts/${contactId}`, {
    method: "PUT",
    headers: authHeaders(env),
    body: JSON.stringify({ customFields }),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`GHL writeOwnedFields ${contactId} failed: ${r.status} ${txt}`);
  }
  return { ok: true, fields: Object.keys(safeUpdates) };
}

// Send SMS via GHL conversations (uses the location's existing SMS provider).
export async function sendSms(env, contactId, body, locationId) {
  const r = await fetch(`${GHL_BASE}/conversations/messages`, {
    method: "POST",
    headers: authHeaders(env),
    body: JSON.stringify({
      type: "SMS",
      contactId,
      message: body,
      ...(locationId ? { locationId } : {}),
    }),
  });
  if (!r.ok) throw new Error(`GHL sendSms failed: ${r.status} ${await r.text()}`);
  return r.json();
}

export async function sendEmail(env, contactId, subject, html, locationId) {
  const r = await fetch(`${GHL_BASE}/conversations/messages`, {
    method: "POST",
    headers: authHeaders(env),
    body: JSON.stringify({
      type: "Email",
      contactId,
      subject,
      html,
      ...(locationId ? { locationId } : {}),
    }),
  });
  if (!r.ok) throw new Error(`GHL sendEmail failed: ${r.status} ${await r.text()}`);
  return r.json();
}

export async function sendConversationNote(env, contactId, body) {
  const r = await fetch(`${GHL_BASE}/conversations/messages`, {
    method: "POST",
    headers: authHeaders(env),
    body: JSON.stringify({
      type: "Custom",
      contactId,
      message: body,
    }),
  });
  if (!r.ok) throw new Error(`GHL sendConversationNote failed: ${r.status} ${await r.text()}`);
  return r.json();
}
