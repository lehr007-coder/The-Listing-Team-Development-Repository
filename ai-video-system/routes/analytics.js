// Analytics endpoints (open pixels, click redirects, watch heartbeats).
//
//   GET  /v1/analytics/open?job=<id>           → 1x1 GIF, records "open"
//   GET  /v1/analytics/click?job=<id>&to=<url> → 302 to <url>, records "click"
//   POST /v1/analytics/event { job_id, event, meta }  → record arbitrary

import { json, error, readJson } from "../lib/util.js";
import { recordEvent, PIXEL_GIF } from "../lib/tracking.js";
import { getVideoJob } from "../lib/supabase.js";

export default async function analyticsRoute(request, env, ctx, url) {
  const path = url.pathname.replace(/^\/v1\/analytics/, "") || "/";

  if (request.method === "GET" && path === "/open") {
    const jobId = url.searchParams.get("job");
    const src = url.searchParams.get("src") || "page";
    if (jobId) ctx.waitUntil(recordEvent(env, { jobId, event: "open", meta: { src } }));
    return new Response(PIXEL_GIF, {
      headers: {
        "Content-Type": "image/gif",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    });
  }

  if (request.method === "GET" && path === "/click") {
    const jobId = url.searchParams.get("job");
    const to = url.searchParams.get("to");
    const src = url.searchParams.get("src") || "unknown";
    if (!to) return error(400, "missing_to");

    // Anti-open-redirect: only allow `to` if it matches a registered
    // destination — same-origin on this worker, or the job's stored
    // cta_url. Anything else is refused so this endpoint can't be used
    // as a phishing launchpad on a trusted domain.
    const allowed = await isAllowedRedirect(env, jobId, to);
    if (!allowed) return error(400, "redirect_not_allowed");

    if (jobId) ctx.waitUntil(recordEvent(env, { jobId, event: "click", meta: { to, src } }));
    return new Response(null, {
      status: 302,
      headers: {
        "Location": to,
        "Referrer-Policy": "no-referrer",
        "Cache-Control": "no-store",
      },
    });
  }

  if (request.method === "POST" && path === "/event") {
    const { body } = await readJson(request);
    if (!body?.job_id || !body?.event) return error(400, "missing_fields");
    const result = await recordEvent(env, {
      jobId: body.job_id,
      event: body.event,
      contactId: body.contact_id,
      meta: body.meta,
    });
    return json(result);
  }

  return error(404, "not_found");
}

// Returns true iff `to` is one of:
//   • a same-origin URL on this worker (e.g. /v/<jobId>)
//   • the cta_url stored on the named video_job row (exact href OR same origin)
// Any other URL — including arbitrary https sites, javascript:, data:,
// file: — is refused. If jobId is absent only same-origin is allowed.
async function isAllowedRedirect(env, jobId, to) {
  let target;
  try {
    target = new URL(to);
  } catch {
    return false;
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") return false;

  const baseOrigin = env.BASE_URL ? new URL(env.BASE_URL).origin : null;
  if (baseOrigin && target.origin === baseOrigin) return true;

  if (!jobId) return false;
  const job = await getVideoJob(env, jobId).catch(() => null);
  if (!job?.cta_url) return false;

  let cta;
  try { cta = new URL(job.cta_url); } catch { return false; }
  return target.href === cta.href || target.origin === cta.origin;
}
