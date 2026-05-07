// Delivery orchestration for personal/private videos.
// Always reads job row → calls VIDEO DELIVERY AGENT → sends via GHL
// conversations (SMS / Email / Custom note). NEVER posts to social platforms.

import { getVideoJob, updateVideoJob, insertVideoEvent } from "./supabase.js";
import { invokeAgent } from "./agents.js";
import { sendSms, sendEmail, sendConversationNote, writeOwnedFields, getContact, readField, appendContactNote } from "./ghl.js";
import { nowIso } from "./util.js";

function formatVideoType(t) {
  return String(t || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// Substitute {{KEY}} and {KEY} tokens. Used for hosted_url, gif_url,
// first_name, cta_text, etc. in agent-generated email/sms bodies.
function applyTemplateVars(text, vars) {
  if (!text) return text;
  let out = String(text);
  for (const [k, v] of Object.entries(vars || {})) {
    if (v == null) continue;
    const value = String(v);
    out = out.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g"), value);
    out = out.replace(new RegExp(`\\{\\s*${k}\\s*\\}`, "g"), value);
  }
  return out;
}

// Append a 1x1 pixel that hits /v1/analytics/open?job=X&src=email when
// the email is opened in clients that load remote images (Gmail does
// via its image proxy on first open; many others on user click).
function injectEmailOpenPixel(html, env, jobId) {
  if (!html) return html;
  const pixel =
    `<img src="${env.BASE_URL}/v1/analytics/open?job=${encodeURIComponent(jobId)}&src=email"` +
    ` width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0;opacity:0">`;
  return html.includes("</body>")
    ? html.replace("</body>", pixel + "</body>")
    : html + pixel;
}

// Wrap a destination URL in our click-tracking redirect so we record
// /v1/analytics/click?job=X&to=Y when the user clicks. Returns the
// original URL unchanged if it already points at our analytics path.
function wrapClickTracking(env, jobId, dest) {
  if (!dest || typeof dest !== "string") return dest;
  if (dest.includes(`${env.BASE_URL}/v1/analytics/`)) return dest;
  return `${env.BASE_URL}/v1/analytics/click?job=${encodeURIComponent(jobId)}&to=${encodeURIComponent(dest)}`;
}

// Compact, scannable note body. Single multi-line string that renders
// nicely in the GHL contact-timeline note card.
function buildVideoHistoryNote(job, channels, formatted) {
  return [
    `🎥 AI Video Sent — ${formatVideoType(job.video_type)} (${job.render_engine})`,
    `Watch: ${job.hosted_url}`,
    `Sent via ${channels.join(", ") || "—"} · CTA: "${formatted.cta_text || "Schedule a call"}"`,
    `Job: ${job.id} · ${nowIso()}`,
  ].join("\n");
}

const PRIVATE_CHANNELS = ["sms", "email", "conversation"];

export async function runDelivery(env, jobId) {
  const job = await getVideoJob(env, jobId);
  if (!job) throw new Error(`runDelivery: job ${jobId} not found`);

  // Hard guard: never auto-post personal videos publicly.
  if (job.distribution === "social") {
    throw new Error(`runDelivery refused: job ${jobId} is social, not private`);
  }

  const contact = await getContact(env, job.contact_id);

  const deliveryCtx = {
    job_id: jobId,
    video_type: job.video_type,
    hosted_url: job.hosted_url,
    gif_url: job.gif_url,
    thumbnail_url: job.thumbnail_url,
    contact: {
      first_name: contact.firstName,
      last_name: contact.lastName,
      email: contact.email,
      phone: contact.phone,
    },
    script: job.script,
    cta_url_token: job.hosted_url,
    agent_first_name: readField(contact, "agent_first_name"),
    agent_brand: readField(contact, "agent_brand"),
  };

  const formatted = await invokeAgent(env, "video_delivery", deliveryCtx);

  // Substitute placeholders the agent might have used. Agents are
  // prompted to use {{HOSTED_URL}} etc. but we can't trust the model
  // to always do so consistently — substitute defensively.
  const tplVars = {
    HOSTED_URL: job.hosted_url,
    GIF_URL: job.gif_url || "",
    THUMBNAIL_URL: job.thumbnail_url || "",
    CTA_TEXT: formatted.cta_text || "Schedule a call",
    first_name: contact.firstName || "there",
    last_name: contact.lastName || "",
    firstName: contact.firstName || "there",
    AGENT_FIRST_NAME: readField(contact, "agent_first_name") || "",
    AGENT_BRAND: readField(contact, "agent_brand") || "",
  };

  const subject  = applyTemplateVars(formatted.email_subject, tplVars);
  const smsBody  = applyTemplateVars(formatted.sms, tplVars);
  const noteBody = applyTemplateVars(formatted.conversation_note || formatted.sms, tplVars);
  // Email: substitute placeholders, then inject the open-tracking pixel
  const emailHtml = injectEmailOpenPixel(
    applyTemplateVars(formatted.email_html, tplVars),
    env, jobId
  );

  const channels = (job.delivery_channels || []).filter(c => PRIVATE_CHANNELS.includes(c));
  const results = {};

  for (const ch of channels) {
    try {
      if (ch === "sms" && contact.phone) {
        results.sms = await sendSms(env, contact.id, smsBody, contact.locationId);
      } else if (ch === "email" && contact.email) {
        results.email = await sendEmail(env, contact.id, subject, emailHtml, contact.locationId);
      } else if (ch === "conversation") {
        results.conversation = await sendConversationNote(env, contact.id, noteBody);
      }
      await insertVideoEvent(env, {
        job_id: jobId, contact_id: contact.id,
        event: `sent_${ch}`, meta: {}, created_at: nowIso(),
      });
    } catch (e) {
      console.error(`delivery ${ch} failed for ${jobId}:`, e.message);
      results[`${ch}_error`] = e.message;
    }
  }

  await updateVideoJob(env, jobId, {
    status: "delivered",
    delivered_at: nowIso(),
    delivery_results: results,
  });

  // Latest-video custom fields (these DO overwrite each render — that's the
  // intended behavior; they always reflect the most recent video).
  try {
    await writeOwnedFields(env, contact.id, {
      video_status: "delivered",
      video_last_sent: nowIso(),
      video_delivery_method: channels.join(","),
      last_video_cta: formatted.cta_text || "",
    });
  } catch (e) {
    console.warn(`writeOwnedFields(${contact.id}) failed (non-fatal):`, e.message);
  }

  // History note on the contact timeline. Each delivery appends a NEW
  // note (never overwrites). Gives users a chronological video log
  // visible in the GHL UI without needing to query our admin API.
  try {
    const noteBody = buildVideoHistoryNote(job, channels, formatted);
    const note = await appendContactNote(env, contact.id, noteBody);
    await insertVideoEvent(env, {
      job_id: jobId,
      contact_id: contact.id,
      event: "ghl_note_appended",
      meta: { note_id: note?.note?.id || note?.id || null },
      created_at: nowIso(),
    });
  } catch (e) {
    console.warn(`appendContactNote(${contact.id}) failed (non-fatal):`, e.message);
  }

  return { jobId, channels, results };
}
