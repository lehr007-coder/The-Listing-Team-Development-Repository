// Analytics endpoints (open pixels, click redirects, watch heartbeats).
//
//   GET  /v1/analytics/open?job=<id>           → 1x1 GIF, records "open"
//   GET  /v1/analytics/click?job=<id>&to=<url> → 302 to <url>, records "click"
//   POST /v1/analytics/event { job_id, event, meta }  → record arbitrary

import { json, error, readJson } from "../lib/util.js";
import { recordEvent, PIXEL_GIF } from "../lib/tracking.js";

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
    if (jobId) ctx.waitUntil(recordEvent(env, { jobId, event: "click", meta: { to, src } }));
    return Response.redirect(to, 302);
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
