import { json } from "../lib/util.js";

export default async function healthRoute(request, env) {
  return json({
    service: "ai-video-system",
    env: env.ENVIRONMENT,
    ok: true,
    bindings: {
      VIDEO_BUCKET: !!env.VIDEO_BUCKET,
      PREVIEW_BUCKET: !!env.PREVIEW_BUCKET,
      VIDEO_KV: !!env.VIDEO_KV,
      RENDER_QUEUE: !!env.RENDER_QUEUE,
    },
    upstreams: {
      heygen: !!env.HEYGEN_API_KEY,
      fcpxml: !!env.FCPXML_MCP_URL,
      cf_stream: !!env.CF_STREAM_API_TOKEN,
      cf_images: !!env.CF_IMAGES_API_TOKEN,
      ghl: !!(env.GHL_V2_TOKEN || env.GHL_API_KEY),
      supabase: !!(env.SUPABASE_URL && env.SUPABASE_KEY),
    },
    time: new Date().toISOString(),
  });
}
