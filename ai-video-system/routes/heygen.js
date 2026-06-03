// HeyGen pipeline: render-trigger + callback.
//
// POST /v1/heygen/render
//   Body: {
//     contact_id: "...",                  // required
//     video_type: "seller_valuation"      // required (one of HEYGEN_VIDEO_TYPES)
//                | "fsbo_outreach"
//                | "buyer_activity"
//                | "showing_request"
//                | "appointment_reminder"
//                | "lead_nurture"
//                | "priority_lead",
//     trigger_reason: "string",
//     priority_score: 0-100 (optional),
//     delivery_channels: ["sms","email","conversation"] (default ["email"]),
//     overrides: { script?, avatar_id?, voice_id? } (optional)
//   }
//
// POST /v1/heygen/callback
//   HeyGen → us. Body shape per HeyGen docs:
//     { event_type: "avatar_video.success", event_data: { video_id, url, callback_id, ... } }
//   We verify HMAC if HEYGEN_CALLBACK_SECRET is set.

import { json, error, readJson, newJobId, nowIso, verifyHmacSignature, isKilled } from "../lib/util.js";
import { getContact, readLeadIntelligence, writeOwnedFields } from "../lib/ghl.js";
import { getRecentEvents, getLead, getScoringLog, insertVideoJob, updateVideoJob, getVideoJob, findActiveJobForContact } from "../lib/supabase.js";
import { invokeAgent } from "../lib/agents.js";
import { createAvatarVideo } from "../lib/heygen.js";
import { enqueueOrInline } from "../lib/queue-producer.js";
import { processOne } from "../lib/queue-consumer.js";
import { checkRateLimit, incrementRateLimit } from "../lib/rate-limit.js";

const HEYGEN_VIDEO_TYPES = new Set([
  "seller_valuation",
  "fsbo_outreach",
  "expired_listing",
  "buyer_activity",
  "new_listing_match",
  "market_update",
  "open_house_invite",
  "showing_request",
  "appointment_reminder",
  "mortgage_update",
  "lead_nurture",
  "priority_lead",
]);

export default async function heygenRoute(request, env, ctx, url) {
  const method = request.method;
  const path = url.pathname.replace(/^\/v1\/heygen/, "") || "/";

  if (method === "POST" && path === "/render")   return handleRender(request, env);
  if (method === "POST" && path === "/callback") return handleCallback(request, env, ctx);
  if (method === "GET"  && path.startsWith("/jobs/")) {
    const jobId = path.split("/")[2];
    const job = await getVideoJob(env, jobId);
    return job ? json(job) : error(404, "not_found", `job ${jobId} not found`);
  }

  return error(404, "not_found", `No HeyGen route: ${method} ${path}`);
}

async function handleRender(request, env) {
  if (await isKilled(env)) {
    return error(503, "kill_switch_active", "AI video pipeline is paused — clear via DELETE /v1/admin/kill");
  }

  const { body } = await readJson(request);
  if (!body) return error(400, "bad_json");

  let { contact_id, video_type, trigger_reason, priority_score = 50,
        delivery_channels = ["email"], overrides = {} } = body;

  // GHL's standard Webhook action (the free one) sends ALL custom-data fields
  // as strings — coerce here so we don't have to require the paid Custom
  // Webhook add-on.
  priority_score = Number(priority_score) || 50;
  if (typeof delivery_channels === "string") {
    const s = delivery_channels.trim();
    try {
      delivery_channels = JSON.parse(s);
    } catch {
      delivery_channels = s.replace(/^\[|\]$/g, "").split(",")
        .map(x => x.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    }
  }
  if (!Array.isArray(delivery_channels)) delivery_channels = ["email"];

  if (!contact_id) return error(400, "missing_contact_id");
  if (!HEYGEN_VIDEO_TYPES.has(video_type)) {
    return error(400, "invalid_video_type", `video_type must be one of ${[...HEYGEN_VIDEO_TYPES].join(",")}`);
  }

  // Idempotency: if there's an active job for this contact + type, return it.
  const existing = await findActiveJobForContact(env, contact_id, video_type);
  if (existing) return json({ job_id: existing.id, status: existing.status, deduped: true });

  // Rate-limit guardrail — protect against runaway spend
  const rl = await checkRateLimit(env, contact_id);
  if (!rl.allowed) {
    return error(429, rl.reason, `Daily render limit reached`, {
      count: rl.count,
      limit: rl.limit,
      day: rl.day,
      hint: "Adjust DAILY_RENDER_LIMIT / PER_CONTACT_DAILY_LIMIT env vars if intentional, or use the kill-switch (DELETE /v1/admin/kill) once cleared.",
    });
  }

  const contact = await getContact(env, contact_id);
  const intelligence = readLeadIntelligence(contact);
  const [events, lead, scoring] = await Promise.all([
    getRecentEvents(env, contact_id, 25),
    getLead(env, contact_id),
    getScoringLog(env, contact_id, 10),
  ]);

  // Invoke the HeyGen Script Agent
  const script = overrides.script
    ? { script: overrides.script, sms_copy: "", email_subject: "", email_html: "", cta_text: "" }
    : await invokeAgent(env, "heygen_script", {
        intelligence, events, lead, scoring, video_type, trigger_reason,
      });

  const jobId = newJobId("vj");
  const callbackUrl = `${env.BASE_URL}/v1/heygen/callback?job=${jobId}`;

  // Aspect-ratio default: vertical for SMS/mobile, but if delivery is
  // email-only the recipient probably reads on desktop — flip to 16:9.
  // Overrides.aspect always wins.
  const channelsLower = (delivery_channels || []).map(c => String(c).toLowerCase());
  const emailOnly = channelsLower.length === 1 && channelsLower[0] === "email";
  const aspect = overrides.aspect || (emailOnly ? "16:9" : "9:16");

  // Submit to HeyGen. createAvatarVideo picks the branded template for
  // this video_type when one is configured (see VIDEO_TYPE_TEMPLATE_VAR
  // in lib/heygen.js), otherwise falls back to /v2/video/generate with
  // the default avatar + voice.
  const heygen = await createAvatarVideo(env, {
    script: script.script,
    videoType: video_type,
    avatarId: overrides.avatar_id,
    voiceId: overrides.voice_id,
    aspect,
    callbackUrl,
    metadata: { job_id: jobId },
  });

  await insertVideoJob(env, {
    id: jobId,
    contact_id,
    video_type,
    render_engine: "HEYGEN",
    distribution: "private",
    status: "rendering",
    trigger_reason,
    priority_score,
    delivery_channels,
    aspect,
    script: script.script,
    script_meta: script,
    heygen_video_id: heygen.heygenVideoId,
    created_at: nowIso(),
  });

  // Field write is best-effort — render is already in flight, don't blow up
  // the whole request if GHL has a transient hiccup.
  try {
    await writeOwnedFields(env, contact_id, {
      ai_video_type: video_type,
      ai_video_script: script.script,
      video_render_engine: "HEYGEN",
      video_priority_score: String(priority_score),
      video_trigger_reason: trigger_reason || "",
      video_status: "rendering",
      video_render_job_id: jobId,
    });
  } catch (e) {
    console.error(`writeOwnedFields(${contact_id}) failed (non-fatal):`, e.message);
  }

  // Increment rate-limit counters AFTER successful HeyGen submission
  await incrementRateLimit(env, contact_id).catch(e =>
    console.warn("incrementRateLimit failed (non-fatal):", e.message)
  );

  return json({ job_id: jobId, status: "rendering", heygen_video_id: heygen.heygenVideoId });
}

async function handleCallback(request, env, ctx) {
  const { text, body } = await readJson(request);

  // Optional HMAC verification
  if (env.HEYGEN_CALLBACK_SECRET) {
    const sig = request.headers.get("X-Signature") || request.headers.get("x-signature");
    const ok = await verifyHmacSignature(text, sig, env.HEYGEN_CALLBACK_SECRET);
    if (!ok) return error(401, "bad_signature");
  }

  if (!body) return error(400, "bad_json");

  const eventType = body.event_type || body.type;
  const data = body.event_data || body.data || {};
  const jobId = data.callback_id || new URL(request.url).searchParams.get("job");

  if (!jobId) return error(400, "missing_job_id");
  const job = await getVideoJob(env, jobId);
  if (!job) return error(404, "job_not_found");

  // Idempotency: KV dedupe by HeyGen video_id + event_type
  const dedupeKey = `cb:heygen:${data.video_id || jobId}:${eventType}`;
  const seen = await env.VIDEO_KV.get(dedupeKey);
  if (seen) return json({ ok: true, deduped: true });
  await env.VIDEO_KV.put(dedupeKey, "1", { expirationTtl: 60 * 60 * 24 });

  if (eventType === "avatar_video.fail" || eventType === "video.fail") {
    await updateVideoJob(env, jobId, {
      status: "failed",
      error: data.message || "heygen reported failure",
      failed_at: nowIso(),
    });
    if (job.contact_id) {
      await writeOwnedFields(env, job.contact_id, { video_status: "failed" });
    }
    return json({ ok: true, status: "failed" });
  }

  if (eventType === "avatar_video.success" || eventType === "video.success") {
    const sourceMp4Url = data.url || data.video_url;
    if (!sourceMp4Url) return error(400, "missing_video_url");

    // MINIMAL pipeline — every silent-kill we've observed correlates
    // with multiple long-running fetches in a single invocation
    // (R2 fetch+put + Stream upload + delivery's Anthropic call all
    // adds up past Cloudflare's 30s CPU budget). So the webhook now
    // does ONLY two things in this invocation:
    //
    //   1. A single DB update marking the job rendered, using the
    //      HeyGen URL itself as r2_url (HeyGen URLs are publicly
    //      fetchable for ~24h — long enough for the recipient to
    //      open the email).
    //   2. A self-fetch to /v1/delivery/send which delivers the
    //      email in its own fresh invocation (proven working in
    //      isolation — vj_mpx84ptv).
    //
    // R2 + Stream archival can be added later as a separate
    // background migration if persistence beyond 24h is needed.
    const hostedUrl = `${env.HOSTED_BASE_URL || env.BASE_URL}/v/${jobId}`;
    try {
      await updateVideoJob(env, jobId, {
        status: "rendered",
        r2_url: sourceMp4Url,
        hosted_url: hostedUrl,
        rendered_at: nowIso(),
        error: null,
      });
    } catch (e) {
      console.error(`callback updateVideoJob failed for ${jobId}:`, e.stack || e.message);
      return json({ ok: false, error: e.message });
    }
    console.log(`callback ${jobId}: marked rendered (using HeyGen URL directly) — triggering delivery`);

    // Delivery in a fresh worker invocation via self-fetch.
    try {
      const dr = await fetch(`${env.BASE_URL}/v1/delivery/send`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.PROXY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ job_id: jobId }),
      });
      const drText = await dr.text();
      if (!dr.ok) {
        console.error(`callback delivery self-fetch failed for ${jobId}: HTTP ${dr.status} ${drText.slice(0, 300)}`);
        return json({ ok: false, http_status: dr.status, error: drText.slice(0, 300) });
      }
      console.log(`callback ${jobId}: delivery dispatched — ${drText.slice(0, 200)}`);
      return json({ ok: true, dispatched: "minimal-webhook+delivery-selffetch" });
    } catch (e) {
      console.error(`callback delivery self-fetch error for ${jobId}:`, e.message);
      return json({ ok: false, error: e.message });
    }
  }

  return json({ ok: true, ignored: eventType });
}
