// FCPXML pipeline: render-trigger + callback.
//
// POST /v1/fcpxml/render
//   Body: {
//     video_type: "luxury_listing" | "market_update" | "youtube_short"
//                | "idx_showcase" | "community_spotlight" | "social_brand",
//     listing_id?: "...",                       // for listing-driven types
//     contact_id?: "...",                       // for share-back
//     market_data?: { ... },                    // for market_update
//     trigger_reason: "string",
//     distribution: "social" | "private",
//     social_targets: ["tiktok","instagram_reels","instagram_stories",
//                      "facebook_reels","facebook_stories","youtube_shorts"],
//     scheduled_post_at?: ISO8601,
//     overrides?: { aspect, duration_target_s, music }
//   }
//
// POST /v1/fcpxml/callback
//   FCPXML MCP → us when render completes.

import { json, error, readJson, newJobId, nowIso, verifyHmacSignature } from "../lib/util.js";
import { getListing, insertVideoJob, updateVideoJob, getVideoJob } from "../lib/supabase.js";
import { invokeAgent } from "../lib/agents.js";
import { submitFcpxmlRender } from "../lib/fcpxml.js";
import { enqueueOrInline } from "../lib/queue-producer.js";

const FCPXML_VIDEO_TYPES = new Set([
  "luxury_listing",
  "market_update",
  "youtube_short",
  "idx_showcase",
  "community_spotlight",
  "social_brand",
]);

export default async function fcpxmlRoute(request, env, ctx, url) {
  const method = request.method;
  const path = url.pathname.replace(/^\/v1\/fcpxml/, "") || "/";

  if (method === "POST" && path === "/render")   return handleRender(request, env);
  if (method === "POST" && path === "/callback") return handleCallback(request, env, ctx);
  if (method === "GET" && path.startsWith("/jobs/")) {
    const jobId = path.split("/")[2];
    const job = await getVideoJob(env, jobId);
    return job ? json(job) : error(404, "not_found");
  }

  return error(404, "not_found", `No FCPXML route: ${method} ${path}`);
}

async function handleRender(request, env) {
  const { body } = await readJson(request);
  if (!body) return error(400, "bad_json");

  const {
    video_type, listing_id, contact_id, market_data,
    trigger_reason, distribution = "social",
    social_targets = ["instagram_reels","tiktok","youtube_shorts","facebook_reels"],
    scheduled_post_at, overrides = {},
  } = body;

  if (!FCPXML_VIDEO_TYPES.has(video_type)) {
    return error(400, "invalid_video_type", `video_type must be one of ${[...FCPXML_VIDEO_TYPES].join(",")}`);
  }
  if (distribution !== "social" && distribution !== "private") {
    return error(400, "invalid_distribution");
  }

  const listing = listing_id ? await getListing(env, listing_id) : null;

  const directorOutput = await invokeAgent(env, "fcpxml_director", {
    video_type, listing, market_data, overrides,
  });

  const jobId = newJobId("vj");
  const callbackUrl = `${env.BASE_URL}/v1/fcpxml/callback?job=${jobId}`;

  const sub = await submitFcpxmlRender(env, {
    jobId,
    storyboard: directorOutput.storyboard,
    captions: directorOutput.captions_global,
    overlays: directorOutput.overlays_global,
    music: directorOutput.music,
    aspect: overrides.aspect || "9:16",
    duration_target_s: overrides.duration_target_s || directorOutput.duration_target_s || 45,
    callbackUrl,
    metadata: { job_id: jobId, video_type },
  });

  await insertVideoJob(env, {
    id: jobId,
    contact_id: contact_id || null,
    video_type,
    render_engine: "FCPXML",
    distribution,
    status: "rendering",
    trigger_reason,
    delivery_channels: distribution === "social" ? [] : ["email"],
    social_targets: distribution === "social" ? social_targets : [],
    scheduled_post_at: scheduled_post_at || null,
    listing_id: listing_id || null,
    listing_data: listing,
    scene_plan: directorOutput,
    fcpxml_job_id: sub.fcpxmlJobId,
    aspect: overrides.aspect || "9:16",
    created_at: nowIso(),
  });

  return json({ job_id: jobId, status: "rendering", fcpxml_job_id: sub.fcpxmlJobId });
}

async function handleCallback(request, env, ctx) {
  const { text, body } = await readJson(request);

  if (env.FCPXML_CALLBACK_SECRET) {
    const sig = request.headers.get("X-Signature") || request.headers.get("x-signature");
    const ok = await verifyHmacSignature(text, sig, env.FCPXML_CALLBACK_SECRET);
    if (!ok) return error(401, "bad_signature");
  }

  if (!body) return error(400, "bad_json");

  const jobId = body.job_id || new URL(request.url).searchParams.get("job");
  if (!jobId) return error(400, "missing_job_id");
  const job = await getVideoJob(env, jobId);
  if (!job) return error(404, "job_not_found");

  const dedupeKey = `cb:fcpxml:${jobId}:${body.status}`;
  const seen = await env.VIDEO_KV.get(dedupeKey);
  if (seen) return json({ ok: true, deduped: true });
  await env.VIDEO_KV.put(dedupeKey, "1", { expirationTtl: 60 * 60 * 24 });

  if (body.status === "failed") {
    await updateVideoJob(env, jobId, {
      status: "failed",
      error: body.error || "fcpxml mcp reported failure",
      failed_at: nowIso(),
    });
    return json({ ok: true, status: "failed" });
  }

  if (body.status === "complete" || body.status === "success") {
    const sourceMp4Url = body.mp4_url || body.video_url;
    if (!sourceMp4Url) return error(400, "missing_video_url");

    const dispatch = await enqueueOrInline(env, ctx, {
      jobId, sourceMp4Url, kind: "fcpxml",
      vertical_crops: body.vertical_crops || null,
    });
    return json({ ok: true, ...dispatch });
  }

  return json({ ok: true, ignored: body.status });
}
