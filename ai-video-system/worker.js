// AI VIDEO SYSTEM — sidecar worker
//
// Isolated companion to thelistingteamproxy. Does NOT modify any existing
// workflow, webhook, automation, custom field, or routing in the production
// ecosystem. Read-only against existing GHL + Ylopo state; write-only into
// its own video_jobs / video_events tables and its own GHL custom fields.
//
// Routes live under /v1/* (api) and /v/* (public hosted pages + tracking).

import { json, error, requireApiKey, cors, corsResponse } from "./lib/util.js";

import healthRoute from "./routes/health.js";
import heygenRoute from "./routes/heygen.js";
import fcpxmlRoute from "./routes/fcpxml.js";
import deliveryRoute from "./routes/delivery.js";
import socialRoute from "./routes/social.js";
import analyticsRoute from "./routes/analytics.js";
import hostedRoute from "./routes/hosted.js";
import mediaRoute from "./routes/media.js";
import adminRoute from "./routes/admin.js";
import devstubRoute from "./routes/devstub.js";

import { processRenderQueueBatch } from "./lib/queue-consumer.js";

const ROUTES = [
  { prefix: "/v1/health",            auth: false, handler: healthRoute },
  // Callback paths must be unauthenticated — real HeyGen / FCPXML services
  // can't know our internal bearer. HMAC signature verification (inside the
  // handlers) is the actual auth for these paths. Listed BEFORE the parent
  // /v1/heygen and /v1/fcpxml prefixes so the matcher picks them first.
  { prefix: "/v1/heygen/callback",   auth: false, handler: heygenRoute },
  { prefix: "/v1/fcpxml/callback",   auth: false, handler: fcpxmlRoute },
  { prefix: "/v1/heygen",            auth: true,  handler: heygenRoute },
  { prefix: "/v1/fcpxml",            auth: true,  handler: fcpxmlRoute },
  { prefix: "/v1/delivery",          auth: true,  handler: deliveryRoute },
  { prefix: "/v1/social",            auth: true,  handler: socialRoute },
  { prefix: "/v1/admin",             auth: true,  handler: adminRoute },
  { prefix: "/v1/_dev",              auth: false, handler: devstubRoute },  // gated internally on ENVIRONMENT
  { prefix: "/v1/analytics",         auth: false, handler: analyticsRoute },
  { prefix: "/v",                    auth: false, handler: hostedRoute },
  { prefix: "/media",                auth: false, handler: mediaRoute },
];

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return corsResponse();

    const url = new URL(request.url);
    const path = url.pathname;

    // Root health
    if (path === "/" || path === "/v1") {
      return json({ service: "ai-video-system", env: env.ENVIRONMENT, ok: true });
    }

    for (const route of ROUTES) {
      if (path === route.prefix || path.startsWith(route.prefix + "/")) {
        if (route.auth) {
          const authErr = requireApiKey(request, env);
          if (authErr) return authErr;
        }
        try {
          const res = await route.handler(request, env, ctx, url);
          return cors(res);
        } catch (e) {
          console.error(`[${route.prefix}]`, e.stack || e.message);
          return cors(error(500, "internal_error", e.message));
        }
      }
    }

    return cors(error(404, "not_found", `No route for ${path}`));
  },

  // Cloudflare only invokes this when a queue consumer binding exists.
  async queue(batch, env, ctx) {
    return processRenderQueueBatch(batch, env, ctx);
  },
};
