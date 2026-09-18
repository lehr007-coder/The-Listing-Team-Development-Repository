import { json } from "../lib/util.js";

// Bumped on each git deploy so we can verify CI's bundle reached the edge.
// If /v1/health doesn't show this build, the dashboard rolled the script
// back — re-push from git or force-redeploy via wrangler.
const BUILD_MARKER = "v5-2026-09-18-d1-jobstore";

export default async function healthRoute(request, env) {
  const isProduction = env.ENVIRONMENT === "production";
  return json({
    service: "ai-video-system",
    env: env.ENVIRONMENT,
    build: BUILD_MARKER,
    ok: true,
    // HeyGen render mode: production burns real API credits;
    // staging uses HeyGen's free test mode (watermarked sample).
    heygen_mode: isProduction ? "live (paid credits)" : "test (free)",
    // Cron poll-fallback was temporarily disabled across both envs
    // while we verify the HeyGen webhook callback path is reliable.
    // Re-enable by setting crons = ["* * * * *"] in wrangler.toml.
    cron_enabled: false,
    delivery_path: "heygen_webhook_only",
    bindings: {
      VIDEO_BUCKET: !!env.VIDEO_BUCKET,
      PREVIEW_BUCKET: !!env.PREVIEW_BUCKET,
      VIDEO_KV: !!env.VIDEO_KV,
      RENDER_QUEUE: !!env.RENDER_QUEUE,
      VIDEO_DB: !!env.VIDEO_DB,
    },
    upstreams: {
      heygen: !!env.HEYGEN_API_KEY,
      fcpxml: !!env.FCPXML_MCP_URL,
      cf_stream: !!env.CF_STREAM_API_TOKEN,
      cf_images: !!env.CF_IMAGES_API_TOKEN,
      ghl: !!(env.GHL_V2_TOKEN || env.GHL_API_KEY),
      // Supabase is now READ-ONLY intelligence lookups only; job state
      // lives in D1 (VIDEO_DB above).
      supabase_intelligence: !!(env.SUPABASE_URL && env.SUPABASE_KEY),
    },
    time: new Date().toISOString(),
  });
}
