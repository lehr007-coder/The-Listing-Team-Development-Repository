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
import dashboardRoute from "./routes/dashboard.js";
import ghlWebhookRoute from "./routes/ghl_webhook.js";
import liveavatarRoute from "./routes/liveavatar.js";

import { processRenderQueueBatch } from "./lib/queue-consumer.js";
import { runHeygenPollFallback } from "./lib/heygen-poll-fallback.js";

const ROUTES = [
  { prefix: "/v1/health",            auth: false, handler: healthRoute },
  // Callback paths must be unauthenticated — real HeyGen / FCPXML services
  // can't know our internal bearer. HMAC signature verification (inside the
  // handlers) is the actual auth for these paths. Listed BEFORE the parent
  // /v1/heygen and /v1/fcpxml prefixes so the matcher picks them first.
  { prefix: "/v1/heygen/callback",   auth: false, handler: heygenRoute },
  { prefix: "/v1/fcpxml/callback",   auth: false, handler: fcpxmlRoute },
  { prefix: "/v1/ghl/webhook",       auth: false, handler: ghlWebhookRoute },
  { prefix: "/v1/heygen",            auth: true,  handler: heygenRoute },
  { prefix: "/v1/fcpxml",            auth: true,  handler: fcpxmlRoute },
  { prefix: "/v1/delivery",          auth: true,  handler: deliveryRoute },
  { prefix: "/v1/social",            auth: true,  handler: socialRoute },
  { prefix: "/v1/admin",             auth: true,  handler: adminRoute },
  // Public by necessity — the browser SDK calls /session and /session/:id/end
  // directly (it has no way to hold a bearer key). Safety is the
  // LIVEAVATAR_ENABLED flag + independent kill-switch + rate caps inside
  // the handler itself, not this auth flag. See routes/liveavatar.js.
  { prefix: "/v1/liveavatar",        auth: false, handler: liveavatarRoute },
  { prefix: "/v1/_dev",              auth: false, handler: devstubRoute },  // gated internally on ENVIRONMENT
  { prefix: "/v1/analytics",         auth: false, handler: analyticsRoute },
  // /admin serves an HTML dashboard. Page itself is unauthenticated
  // (anyone can load the HTML); every fetch from the page sends the
  // X-API-Key header against the /v1/admin/* JSON endpoints which DO
  // require auth. Dashboard prompts for the key and stores in
  // localStorage so users only enter it once per browser.
  { prefix: "/admin",                auth: false, handler: dashboardRoute },
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

  // Cron — invoked by [triggers] crons in wrangler.toml.
  //
  // Two cron schedules share this handler:
  //   * * * * *      (every minute)        → HeyGen poll-fallback
  //   0 14 * * 1     (Mondays 14:00 UTC)   → Weekly performance report
  //
  // Routing: anything that ISN'T the per-minute schedule routes to the
  // weekly report. This pattern is more resilient than literal string
  // equality — equivalent expressions ("0 14 * * 1" vs "0 14 * * MON") or
  // a future ops edit to the schedule won't accidentally fall through to
  // the poll-fallback path. The report path itself is also dispatched via
  // self-fetch so the actual GHL sends run in a fresh HTTP-handler Worker
  // invocation with their own CPU budget — same silent-kill defense PR #45
  // applied to processOne.
  async scheduled(event, env, ctx) {
    const cron = event?.cron || "";
    const isEveryMinute = cron === "* * * * *";

    if (isEveryMinute) {
      try {
        const r = await runHeygenPollFallback(env, ctx);
        console.log("scheduled: heygen-poll-fallback", JSON.stringify(r));
      } catch (e) {
        console.error("scheduled: heygen-poll-fallback failed:", e.stack || e.message);
      }
      return;
    }

    // Any non-minute cron → weekly report + orphan cleanup, both dispatched
    // via self-fetch so they each run in their own HTTP-handler invocation
    // with a fresh CPU budget. ctx.waitUntil keeps the scheduled handler
    // alive long enough for both dispatches to land.
    console.log(`scheduled: dispatching weekly-report + orphan-cleanup (cron='${cron}')`);

    const authHeaders = {
      "Authorization": `Bearer ${env.PROXY_API_KEY}`,
      "Content-Type": "application/json",
    };

    const p = fetch(`${env.BASE_URL}/v1/admin/reports/weekly/send`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({}),
    })
      .then(r => r.json())
      .then(res => console.log("scheduled: weekly-report dispatched", JSON.stringify({
        ok: res.ok,
        recipients_attempted: res.recipients_attempted,
        recipients_delivered: res.recipients_delivered,
        totals: res.totals,
        reason: res.reason,
      })))
      .catch(e => console.error("scheduled: weekly-report dispatch failed:", e.message));

    // Auto-cleanup orphaned 'rendered' jobs (delivered 6h–30d ago, never
    // received a webhook) so they don't pollute dashboards or re-trigger
    // delivery. Runs silently — failures are logged but don't block the report.
    const q = fetch(`${env.BASE_URL}/v1/admin/jobs/orphan-cleanup`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ dry_run: false, max_rows: 50 }),
    })
      .then(r => r.json())
      .then(res => console.log("scheduled: orphan-cleanup", JSON.stringify({
        ok: res.ok, matched: res.matched, updated: res.updated,
      })))
      .catch(e => console.error("scheduled: orphan-cleanup failed:", e.message));

    ctx.waitUntil(Promise.all([p, q]));
  },
};
