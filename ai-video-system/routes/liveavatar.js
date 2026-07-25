// LiveAvatar — live, real-time conversational avatar sessions. Separate
// product/API/key from the pre-rendered HEYGEN pipeline (routes/heygen.js).
//
//   GET  /v1/liveavatar/widget.js         → browser widget (public, static JS)
//   POST /v1/liveavatar/session           → mint a session token for the
//                                            browser SDK to connect with
//   POST /v1/liveavatar/session/:id/end   → best-effort usage/cost logging
//
// Public (no X-API-Key) by necessity — the browser calls these directly,
// same posture as routes/analytics.js and routes/hosted.js. Safety comes
// from: LIVEAVATAR_ENABLED feature flag (off by default), an independent
// kill-switch, and daily session caps — never from a bearer token the
// browser can't hold anyway.
//
// OFF BY DEFAULT. Until LIVEAVATAR_ENABLED="true" and LIVEAVATAR_API_KEY are
// both set, /session always 503s and the "Talk live" button never renders
// (see routes/hosted.js). See docs/LIVEAVATAR.md for the go-live checklist —
// several request-body field names in lib/liveavatar.js are best-guesses
// that need verifying against the real API once an account exists.

import { json, error, readJson, isLiveAvatarKilled } from "../lib/util.js";
import { checkLiveAvatarRateLimit, incrementLiveAvatarRateLimit } from "../lib/rate-limit.js";
import { mintSessionToken, buildAvatarContext } from "../lib/liveavatar.js";
import { getVideoJob, getListing, resolveLeadByGhlContactId, insertLiveAvatarSession, endLiveAvatarSession } from "../lib/supabase.js";
import { renderWidgetJs } from "../lib/liveavatar-widget.js";

const DEFAULT_MAX_SESSION_SECONDS = 300; // 5 min — cost guardrail, see lib/liveavatar.js

export default async function liveavatarRoute(request, env, ctx, url) {
  const path = url.pathname.replace(/^\/v1\/liveavatar/, "") || "/";
  const method = request.method;

  if (method === "GET" && path === "/widget.js") {
    return new Response(renderWidgetJs(env), {
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    });
  }

  if (method === "POST" && path === "/session") {
    return createSession(env, request);
  }

  if (method === "POST" && path.match(/^\/session\/[^/]+\/end$/)) {
    return endSession(env, path.split("/")[2], request);
  }

  return error(404, "not_found");
}

async function createSession(env, request) {
  if (env.LIVEAVATAR_ENABLED !== "true") {
    return error(503, "liveavatar_disabled", "LiveAvatar is not enabled on this deployment");
  }
  if (!env.LIVEAVATAR_API_KEY) {
    return error(503, "liveavatar_unconfigured", "LIVEAVATAR_API_KEY not set");
  }
  if (await isLiveAvatarKilled(env)) {
    return error(503, "liveavatar_killed", "LiveAvatar sessions are currently paused");
  }

  const { body } = await readJson(request);
  const jobId = body?.job_id || null;
  const contactId = body?.contact_id || null;

  const rl = await checkLiveAvatarRateLimit(env, contactId);
  if (!rl.allowed) return error(429, "rate_limited", "LiveAvatar session cap reached", rl);

  // Gather whatever context we have — job/listing/contact are all optional;
  // an anonymous site visitor with none of these still gets a session with
  // the generic system context.
  let job = null, listing = null, lead = null;
  if (jobId) job = await getVideoJob(env, jobId).catch(() => null);
  const listingId = body?.listing_id || job?.listing_id || null;
  if (listingId) listing = await getListing(env, listingId).catch(() => null);
  if (contactId) lead = await resolveLeadByGhlContactId(env, contactId).catch(() => null);

  const context = buildAvatarContext({
    contact: lead ? { first_name: lead.first_name } : null,
    job,
    listing: listing || job?.listing_data || null,
  });

  const maxDurationSeconds = parseInt(env.LIVEAVATAR_MAX_SESSION_SECONDS, 10) || DEFAULT_MAX_SESSION_SECONDS;

  let mint;
  try {
    mint = await mintSessionToken(env, {
      avatarId: body?.avatar_id || env.LIVEAVATAR_DEFAULT_AVATAR_ID,
      maxSessionDurationSeconds: maxDurationSeconds,
      context,
    });
  } catch (e) {
    console.error("liveavatar mintSessionToken failed:", e.message);
    return error(502, "liveavatar_upstream_error", e.message);
  }

  const row = await insertLiveAvatarSession(env, {
    contact_id: contactId,
    job_id: jobId,
    listing_id: listingId,
    avatar_id: body?.avatar_id || env.LIVEAVATAR_DEFAULT_AVATAR_ID || null,
    mode: env.LIVEAVATAR_MODE || "FULL",
    status: "active",
    max_duration_s: maxDurationSeconds,
  }).catch((e) => {
    console.error("insertLiveAvatarSession failed:", e.message);
    return null;
  });

  await incrementLiveAvatarRateLimit(env, contactId);

  return json({
    ok: true,
    session_token: mint.sessionToken,
    session_row_id: row?.id || null,
    max_duration_s: maxDurationSeconds,
  });
}

async function endSession(env, rowId, request) {
  const { body } = await readJson(request);
  const durationSeconds = Number(body?.duration_seconds) || null;
  // Rough cost estimate for the admin dashboard only — 2 credits/min in
  // LiveAvatar's Full mode per their published pricing. Not billing-grade;
  // reconcile against LiveAvatar's own usage dashboard for actual spend.
  const creditsEstimated = durationSeconds ? Math.round((durationSeconds / 60) * 2 * 100) / 100 : null;

  const updated = await endLiveAvatarSession(env, rowId, {
    status: "ended",
    ended_at: new Date().toISOString(),
    duration_s: durationSeconds,
    credits_estimated: creditsEstimated,
    end_reason: body?.reason || null,
  }).catch((e) => {
    console.warn("endLiveAvatarSession failed (best-effort):", e.message);
    return null;
  });

  return json({ ok: true, session: updated });
}
