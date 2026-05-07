// Admin / debugging endpoints. All gated by PROXY_API_KEY (the route
// table marks /v1/admin as auth=true).
//
//   GET    /v1/admin/jobs?limit=50&contact_id=<>&status=<>
//   GET    /v1/admin/jobs/:id
//   GET    /v1/admin/jobs/:id/events
//   POST   /v1/admin/jobs/:id/fail        { "reason": "..." }
//   GET    /v1/admin/health-deep            → /v1/health + active job counters
//
//   GET    /v1/admin/kill                   → current kill-switch state
//   POST   /v1/admin/kill                   → activate kill-switch (paused)
//   DELETE /v1/admin/kill                   → clear kill-switch (resume)

import { json, error, readJson, nowIso, isKilled, setKillSwitch, killSwitchState } from "../lib/util.js";
import { getVideoJob, updateVideoJob } from "../lib/supabase.js";
import { enqueueOrInline } from "../lib/queue-producer.js";

function sbHeaders(env) {
  return {
    "apikey": env.SUPABASE_KEY,
    "Authorization": `Bearer ${env.SUPABASE_KEY}`,
    "Content-Type": "application/json",
  };
}

export default async function adminRoute(request, env, ctx, url) {
  const method = request.method;
  const path = url.pathname.replace(/^\/v1\/admin/, "") || "/";

  // ── Kill-switch ──
  if (path === "/kill") {
    if (method === "GET")    return killGet(env);
    if (method === "POST")   return killSet(request, env);
    if (method === "DELETE") return killClear(env);
    return error(405, "method_not_allowed");
  }

  // ── Manual job-fail ──
  if (method === "POST" && path.match(/^\/jobs\/[^/]+\/fail$/)) {
    return jobFail(env, path.split("/")[2], request);
  }

  // ── Manual reprocess (force the post-render pipeline to run with given URL) ──
  if (method === "POST" && path.match(/^\/jobs\/[^/]+\/reprocess$/)) {
    return jobReprocess(env, ctx, path.split("/")[2], request);
  }

  if (method !== "GET") return error(405, "method_not_allowed");

  if (path === "/jobs")                          return listJobs(env, url);
  if (path.match(/^\/jobs\/[^/]+\/events$/))     return jobEvents(env, path.split("/")[2]);
  if (path.match(/^\/jobs\/[^/]+\/tracking$/))   return jobTracking(env, path.split("/")[2]);
  if (path.match(/^\/jobs\/[^/]+$/))             return jobDetail(env, path.split("/")[2]);
  if (path === "/health-deep")                   return healthDeep(env);
  if (path.match(/^\/contacts\/[^/]+\/videos$/)) return contactVideos(env, path.split("/")[2]);

  return error(404, "not_found", `No admin route: ${method} ${path}`);
}

async function listJobs(env, url) {
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 200);
  const contactId = url.searchParams.get("contact_id");
  const status = url.searchParams.get("status");
  const renderEngine = url.searchParams.get("render_engine");

  const filters = [];
  if (contactId)    filters.push(`contact_id=eq.${encodeURIComponent(contactId)}`);
  if (status)       filters.push(`status=eq.${encodeURIComponent(status)}`);
  if (renderEngine) filters.push(`render_engine=eq.${encodeURIComponent(renderEngine)}`);
  filters.push(`order=created_at.desc`, `limit=${limit}`);

  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/video_jobs?${filters.join("&")}`, {
    headers: sbHeaders(env),
  });
  if (!r.ok) return error(502, "supabase_error", await r.text());
  const rows = await r.json();
  return json({ count: rows.length, jobs: rows });
}

async function jobDetail(env, jobId) {
  const job = await getVideoJob(env, jobId);
  return job ? json(job) : error(404, "not_found");
}

async function jobEvents(env, jobId) {
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/video_events?job_id=eq.${encodeURIComponent(jobId)}` +
    `&order=created_at.asc&limit=200`,
    { headers: sbHeaders(env) }
  );
  if (!r.ok) return error(502, "supabase_error", await r.text());
  const rows = await r.json();
  return json({ job_id: jobId, count: rows.length, events: rows });
}

async function jobReprocess(env, ctx, jobId, request) {
  const job = await getVideoJob(env, jobId);
  if (!job) return error(404, "not_found");
  const { body } = await readJson(request);
  const sourceMp4Url = body?.url || body?.video_url || body?.mp4_url;
  if (!sourceMp4Url) return error(400, "missing_url", "POST { url: '<mp4 url>' }");

  // Reset status so processOne doesn't short-circuit on delivered/failed
  await updateVideoJob(env, jobId, {
    status: "rendering",
    error: null,
    rendered_at: null,
    delivered_at: null,
    failed_at: null,
  });

  // Synthesise a fresh queue message — bypasses dedupe entirely
  const kind = job.render_engine === "FCPXML" ? "fcpxml" : "heygen";
  const dispatch = await enqueueOrInline(env, ctx, { jobId, sourceMp4Url, kind });
  return json({ ok: true, job_id: jobId, kind, ...dispatch });
}

async function jobTracking(env, jobId) {
  const job = await getVideoJob(env, jobId);
  if (!job) return error(404, "not_found");

  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/video_events?job_id=eq.${encodeURIComponent(jobId)}` +
    `&order=created_at.asc&limit=500`,
    { headers: sbHeaders(env) }
  );
  if (!r.ok) return error(502, "supabase_error", await r.text());
  const events = await r.json();

  // Aggregate engagement signals
  const counts = {};
  for (const e of events) counts[e.event] = (counts[e.event] || 0) + 1;

  const watch = {
    25: counts["watch_25"]  || 0,
    50: counts["watch_50"]  || 0,
    75: counts["watch_75"]  || 0,
    100: counts["watch_100"] || 0,
  };
  const max_watch_pct =
    watch[100] ? 100 :
    watch[75]  ? 75  :
    watch[50]  ? 50  :
    watch[25]  ? 25  : 0;

  const SCORE = { open:2, click:5, watch_25:3, watch_50:5, watch_75:8, watch_100:12, cta_click:15, rewatch:4 };
  const engagement_score = events.reduce((s, e) => s + (SCORE[e.event] || 0), 0);

  const first = events[0]?.created_at || null;
  const last  = events[events.length - 1]?.created_at || null;

  return json({
    job_id: jobId,
    contact_id: job.contact_id,
    video_type: job.video_type,
    render_engine: job.render_engine,
    status: job.status,
    hosted_url: job.hosted_url,
    delivered_at: job.delivered_at,
    counts,
    summary: {
      opens:           counts["open"]      || 0,
      clicks:          counts["click"]     || 0,
      cta_clicks:      counts["cta_click"] || 0,
      max_watch_pct,
      watch_milestones: watch,
      sent: {
        email:        counts["sent_email"]        || 0,
        sms:          counts["sent_sms"]          || 0,
        conversation: counts["sent_conversation"] || 0,
      },
      ghl_notes_appended: counts["ghl_note_appended"] || 0,
      engagement_score,
      total_events: events.length,
      first_event_at: first,
      last_event_at:  last,
    },
    timeline: events,
  });
}

async function contactVideos(env, contactId) {
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/video_jobs?contact_id=eq.${encodeURIComponent(contactId)}` +
    `&order=created_at.desc&limit=100`,
    { headers: sbHeaders(env) }
  );
  if (!r.ok) return error(502, "supabase_error", await r.text());
  const jobs = await r.json();
  return json({
    contact_id: contactId,
    count: jobs.length,
    videos: jobs.map(j => ({
      job_id: j.id,
      video_type: j.video_type,
      render_engine: j.render_engine,
      status: j.status,
      hosted_url: j.hosted_url,
      created_at: j.created_at,
      delivered_at: j.delivered_at,
      engagement_score: j.engagement_score,
    })),
  });
}

async function jobFail(env, jobId, request) {
  const job = await getVideoJob(env, jobId);
  if (!job) return error(404, "not_found");
  if (job.status === "delivered" || job.status === "failed") {
    return json({ ok: true, no_op: true, job_id: jobId, status: job.status });
  }
  const { body } = await readJson(request);
  const reason = body?.reason || "manually failed via /v1/admin/jobs/:id/fail";
  const updated = await updateVideoJob(env, jobId, {
    status: "failed",
    failed_at: nowIso(),
    error: reason,
  });
  return json({ ok: true, job_id: jobId, status: "failed", reason, updated });
}

async function killGet(env) {
  const state = await killSwitchState(env);
  return json(state);
}

async function killSet(request, env) {
  const { body } = await readJson(request);
  const result = await setKillSwitch(env, true, {
    reason: body?.reason || "no reason provided",
    set_by: body?.set_by || "admin-api",
  });
  return json({ ok: true, ...result });
}

async function killClear(env) {
  const result = await setKillSwitch(env, false);
  return json({ ok: true, ...result });
}

async function healthDeep(env) {
  const out = {
    service: "ai-video-system",
    env: env.ENVIRONMENT,
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
      anthropic: !!env.ANTHROPIC_API_KEY,
      openai: !!env.OPENAI_API_KEY,
    },
    counters: {},
    kill_switch: await killSwitchState(env),
  };

  if (env.SUPABASE_URL && env.SUPABASE_KEY) {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/video_jobs?select=status&limit=1000`,
      { headers: { ...sbHeaders(env), "Prefer": "count=exact" } }
    );
    if (r.ok) {
      const rows = await r.json();
      const tally = {};
      rows.forEach(row => { tally[row.status] = (tally[row.status] || 0) + 1; });
      out.counters.video_jobs_by_status = tally;
      out.counters.video_jobs_total = rows.length;
    }
  }

  out.time = new Date().toISOString();
  return json(out);
}
