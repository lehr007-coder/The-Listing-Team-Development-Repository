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
//
// GET /v1/heygen/webhooks/debug?limit=20&job_id=<id>
//   Debug endpoint: lists recent webhook attempts (successful + failed) from last 24h.
//   Helps diagnose why webhooks aren't firing or are being rejected (signature, missing job, etc).

import { json, error, readJson, newJobId, nowIso, verifyHmacSignature, isKilled } from "../lib/util.js";
import { getContact, readLeadIntelligence, writeOwnedFields } from "../lib/ghl.js";
import { getRecentEvents, getLead, getScoringLog, insertVideoJob, updateVideoJob, claimVideoJobTransition, getVideoJob, findActiveJobForContact } from "../lib/supabase.js";
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
  if (method === "GET" && path === "/webhooks/debug") {
    return webhooksDebug(env, url);
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

  // Fetch contact early so we can pass locationId to the rate limiter.
  // getContact is cheap (single GHL API call, cached upstream).
  const contact = await getContact(env, contact_id);
  // Rate-limit guardrail — protect against runaway spend (three layers)
  const locationId = contact?.locationId || null;
  const rl = await checkRateLimit(env, contact_id, locationId);
  if (!rl.allowed) {
    return error(429, rl.reason, `Daily render limit reached`, {
      count: rl.count,
      limit: rl.limit,
      day: rl.day,
      location_id: rl.location_id || undefined,
      hint: "Adjust DAILY_RENDER_LIMIT / PER_CONTACT_DAILY_LIMIT / PER_LOCATION_DAILY_LIMIT env vars if intentional, or use the kill-switch (DELETE /v1/admin/kill) once cleared.",
    });
  }

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
  await incrementRateLimit(env, contact_id, locationId).catch(e =>
    console.warn("incrementRateLimit failed (non-fatal):", e.message)
  );

  return json({ job_id: jobId, status: "rendering", heygen_video_id: heygen.heygenVideoId });
}

async function handleCallback(request, env, ctx) {
  const startTime = Date.now();
  const { text, body } = await readJson(request);

  // Log all webhook arrivals for debugging
  const webhookLog = {
    timestamp: new Date().toISOString(),
    has_body: !!body,
    has_signature: !!(request.headers.get("X-Signature") || request.headers.get("x-signature")),
    event_type: body?.event_type || body?.type || "unknown",
    heygen_video_id: body?.event_data?.video_id || body?.data?.video_id || null,
    callback_id: body?.event_data?.callback_id || body?.data?.callback_id || null,
    job_from_params: new URL(request.url).searchParams.get("job"),
  };

  // Required HMAC verification — reject if secret is not configured
  if (!env.HEYGEN_CALLBACK_SECRET) {
    console.error("HEYGEN_CALLBACK_SECRET is not set — rejecting webhook to prevent unsigned callback abuse");
    return error(503, "misconfigured", "HEYGEN_CALLBACK_SECRET not set");
  }
  const sig = request.headers.get("X-Signature") || request.headers.get("x-signature");
  const signatureOk = await verifyHmacSignature(text, sig, env.HEYGEN_CALLBACK_SECRET);
  if (!signatureOk) {
    webhookLog.signature_error = "verification_failed";
    console.warn(`webhook signature verification failed: ${JSON.stringify(webhookLog)}`);
    const failKey = `webhook:failed:${Date.now()}`;
    await env.VIDEO_KV?.put(failKey, JSON.stringify(webhookLog), { expirationTtl: 60 * 60 * 24 });
    return error(401, "bad_signature", "HMAC verification failed");
  }

  if (!body) {
    webhookLog.error = "bad_json";
    console.warn(`webhook received invalid JSON: ${JSON.stringify(webhookLog)}`);
    const failKey = `webhook:failed:${Date.now()}`;
    await env.VIDEO_KV?.put(failKey, JSON.stringify(webhookLog), { expirationTtl: 60 * 60 * 24 });
    return error(400, "bad_json");
  }

  const eventType = body.event_type || body.type;
  const data = body.event_data || body.data || {};
  const jobId = data.callback_id || new URL(request.url).searchParams.get("job");

  webhookLog.job_id = jobId;
  webhookLog.signature_ok = signatureOk;

  if (!jobId) {
    webhookLog.error = "missing_job_id";
    console.warn(`webhook missing job_id: ${JSON.stringify(webhookLog)}`);
    const failKey = `webhook:failed:${Date.now()}`;
    await env.VIDEO_KV?.put(failKey, JSON.stringify(webhookLog), { expirationTtl: 60 * 60 * 24 });
    return error(400, "missing_job_id", `Could not extract job_id from callback_id or 'job' query param`);
  }

  const job = await getVideoJob(env, jobId);
  if (!job) {
    webhookLog.error = "job_not_found";
    console.warn(`webhook received for unknown job: ${JSON.stringify(webhookLog)}`);
    const failKey = `webhook:failed:${Date.now()}`;
    await env.VIDEO_KV?.put(failKey, JSON.stringify(webhookLog), { expirationTtl: 60 * 60 * 24 });
    return error(404, "job_not_found", `Job ${jobId} not found in database`);
  }

  // Idempotency: KV dedupe by HeyGen video_id + event_type
  const dedupeKey = `cb:heygen:${data.video_id || jobId}:${eventType}`;
  const seen = await env.VIDEO_KV.get(dedupeKey);
  if (seen) {
    webhookLog.deduped = true;
    console.log(`webhook ${jobId}: deduped (${eventType})`);
    return json({ ok: true, deduped: true });
  }
  await env.VIDEO_KV.put(dedupeKey, "1", { expirationTtl: 60 * 60 * 24 });

  // Store successful webhook arrival in KV for debugging
  const successKey = `webhook:received:${jobId}:${eventType}:${Date.now()}`;
  await env.VIDEO_KV.put(successKey, JSON.stringify(webhookLog), { expirationTtl: 60 * 60 * 24 });

  if (eventType === "avatar_video.fail" || eventType === "video.fail") {
    console.log(`webhook ${jobId}: HeyGen reported failure — ${data.message || "unknown"}`);
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
    //      open the email). Also pulls HeyGen's own thumbnail and
    //      gif URLs from the webhook payload so the email render
    //      can include a preview image.
    //   2. A self-fetch to /v1/delivery/send which delivers the
    //      email in its own fresh invocation (proven working in
    //      isolation — vj_mpx84ptv).
    //
    // R2 + Stream archival can be added later as a separate
    // background migration if persistence beyond 24h is needed.
    const hostedUrl = `${env.HOSTED_BASE_URL || env.BASE_URL}/v/${jobId}`;
    // HeyGen webhooks include a thumbnail jpeg + animated gif preview
    // URL in the event_data — field names vary by event_type, so try
    // a few common variants. Both URLs work for ~24h same as the
    // mp4 URL. If only the gif came through, use it as the static
    // thumbnail fallback — most email clients render the first
    // frame of an animated gif when used as <img src>.
    const gifUrl =
      data.gif_download_url ||
      data.gif_url ||
      data.gif ||
      null;
    const thumbnailUrl =
      data.thumbnail_url ||
      data.cover_image_url ||
      data.thumbnail ||
      data.cover_url ||
      data.preview_image_url ||
      gifUrl ||  // fallback so email always has SOME preview image
      null;
    // Atomically claim the rendered transition. If another callback (a
    // HeyGen retry or the cron poll-fallback racing in the same instant)
    // already flipped the job to rendered/delivered, we get null back and
    // must NOT dispatch delivery again — otherwise the recipient gets two
    // emails. The KV dedupe above catches spaced-out repeats; this catches
    // truly-simultaneous ones the KV check-then-set can't.
    let claimed;
    try {
      claimed = await claimVideoJobTransition(env, jobId, {
        status: "rendered",
        r2_url: sourceMp4Url,
        hosted_url: hostedUrl,
        thumbnail_url: thumbnailUrl,
        gif_url: gifUrl,
        rendered_at: nowIso(),
        error: null,
      }, ["rendered", "delivered"]);
    } catch (e) {
      console.error(`callback claim failed for ${jobId}:`, e.stack || e.message);
      return json({ ok: false, error: e.message });
    }
    if (!claimed) {
      webhookLog.deduped = true;
      console.log(`webhook ${jobId}: already rendered/delivered — skipping duplicate delivery dispatch`);
      return json({ ok: true, deduped: true });
    }
    console.log(`callback ${jobId}: marked rendered (using HeyGen URL directly, thumbnail=${!!thumbnailUrl}, gif=${!!gifUrl}) — triggering delivery`);

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

  // Unknown/unhandled event type
  console.log(`webhook ${jobId}: unhandled event type — ${eventType}`);
  return json({ ok: true, ignored: eventType });
}

// Debug endpoint: retrieve recent webhook log entries from KV for diagnostics.
// Shows both successful and failed webhook attempts, useful for understanding
// why webhooks aren't firing or are being rejected.
async function webhooksDebug(env, url) {
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10), 100);
  const jobId = url.searchParams.get("job_id");

  // List keys pattern: webhook:received:* or webhook:failed:*
  const list = await env.VIDEO_KV.list({ prefix: "webhook:" });

  const vals = await Promise.all(list.keys.map(k => env.VIDEO_KV.get(k.name)));
  let entries = [];
  for (let i = 0; i < list.keys.length; i++) {
    const val = vals[i];
    if (val) {
      try {
        const entry = JSON.parse(val);
        if (jobId && entry.job_id !== jobId) continue;
        entries.push({ key: list.keys[i].name, ...entry });
      } catch {
        // Ignore parse errors
      }
    }
  }

  // Sort by timestamp descending (most recent first)
  entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return json({
    count: entries.length,
    limit,
    entries: entries.slice(0, limit),
    note: "Shows webhook attempts (both successful and failed) from the last 24 hours. Use ?job_id=<id> to filter to a specific job.",
  });
}
