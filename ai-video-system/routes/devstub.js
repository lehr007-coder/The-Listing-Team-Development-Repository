// Dev stubs — only available when ENVIRONMENT !== "production".
//
// Lets you wire FCPXML_MCP_URL = `${BASE_URL}/v1/_dev/fcpxml-stub`
// (and HEYGEN, if you want) to test the full pipeline before the real
// upstream renderers are stood up.
//
// Stub flow:
//   POST /v1/_dev/fcpxml-stub/render
//     Body matches the real FCPXML MCP shape.
//     Returns immediately with a fake job_id, then waits ~5s and POSTs
//     a "complete" payload to callback_url with a public sample MP4.
//
//   POST /v1/_dev/heygen-stub/generate
//     Mimics HeyGen's /v2/video/generate. Same delayed callback pattern
//     against the configured callback_url.

import { json, error, readJson, newJobId } from "../lib/util.js";

const SAMPLE_MP4 =
  "https://customer-1ca65muyi8nxyq8u.cloudflarestream.com/4dba5bc6c92b8e0b00ca8e4083a2d6f9/downloads/default.mp4";
const SAMPLE_MP4_FALLBACK =
  "https://download.samplelib.com/mp4/sample-5s.mp4";

export default async function devstubRoute(request, env, ctx, url) {
  if (env.ENVIRONMENT === "production") {
    return error(403, "dev_stub_disabled", "Dev stubs are disabled in production");
  }

  const path = url.pathname.replace(/^\/v1\/_dev/, "") || "/";
  const method = request.method;

  if (method === "POST" && path === "/fcpxml-stub/render")    return fcpxmlRender(request, env, ctx);
  if (method === "POST" && path === "/heygen-stub/generate")  return heygenGenerate(request, env, ctx);
  if (method === "GET"  && path === "/sample-mp4")            return Response.redirect(SAMPLE_MP4, 302);

  return error(404, "not_found", `No dev stub: ${method} ${path}`);
}

async function fcpxmlRender(request, env, ctx) {
  const { body } = await readJson(request);
  if (!body) return error(400, "bad_json");
  const { job_id, callback_url } = body;
  if (!callback_url) return error(400, "missing_callback_url");

  const fakeJobId = job_id || newJobId("fcpxml_stub");

  ctx.waitUntil(
    deliverDelayed(callback_url, 5000, {
      job_id: fakeJobId,
      status: "complete",
      mp4_url: SAMPLE_MP4,
      vertical_crops: { "9_16": SAMPLE_MP4 },
      _stub: true,
    })
  );

  return json({ job_id: fakeJobId, status: "queued", _stub: true });
}

async function heygenGenerate(request, env, ctx) {
  const { body } = await readJson(request);
  if (!body) return error(400, "bad_json");
  const callbackUrl = body.callback_url;
  if (!callbackUrl) return error(400, "missing_callback_url");

  const fakeVideoId = `heygen_stub_${Date.now()}`;

  ctx.waitUntil(
    deliverDelayed(callbackUrl, 5000, {
      event_type: "avatar_video.success",
      event_data: {
        video_id: fakeVideoId,
        url: SAMPLE_MP4,
        callback_id: body.callback_id,
      },
      _stub: true,
    })
  );

  return json({
    error: 0,
    data: { video_id: fakeVideoId },
    _stub: true,
  });
}

async function deliverDelayed(callbackUrl, ms, payload) {
  await new Promise(resolve => setTimeout(resolve, ms));
  try {
    const r = await fetch(callbackUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    console.log(`[devstub] callback ${callbackUrl} → ${r.status}`);
  } catch (e) {
    console.error(`[devstub] callback ${callbackUrl} failed:`, e.message);
  }
}
