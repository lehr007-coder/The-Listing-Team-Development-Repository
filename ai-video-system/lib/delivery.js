// Delivery orchestration for personal/private videos.
// Always reads job row → calls VIDEO DELIVERY AGENT → sends via GHL
// conversations (SMS / Email / Custom note). NEVER posts to social platforms.

import { getVideoJob, updateVideoJob, insertVideoEvent } from "./supabase.js";
import { invokeAgent } from "./agents.js";
import { sendSms, sendEmail, sendConversationNote, writeOwnedFields, getContact, readField } from "./ghl.js";
import { nowIso } from "./util.js";

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

  const channels = (job.delivery_channels || []).filter(c => PRIVATE_CHANNELS.includes(c));
  const results = {};

  for (const ch of channels) {
    try {
      if (ch === "sms" && contact.phone) {
        results.sms = await sendSms(env, contact.id, formatted.sms, contact.locationId);
      } else if (ch === "email" && contact.email) {
        results.email = await sendEmail(
          env, contact.id, formatted.email_subject, formatted.email_html, contact.locationId
        );
      } else if (ch === "conversation") {
        results.conversation = await sendConversationNote(env, contact.id, formatted.conversation_note || formatted.sms);
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

  await writeOwnedFields(env, contact.id, {
    video_status: "delivered",
    video_last_sent: nowIso(),
    video_delivery_method: channels.join(","),
    last_video_cta: formatted.cta_text || "",
  });

  return { jobId, channels, results };
}
