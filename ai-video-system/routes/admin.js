// Admin / debugging endpoints. All gated by PROXY_API_KEY (the route
// table marks /v1/admin as auth=true).
//
//   GET    /v1/admin/jobs?limit=50&contact_id=<>&status=<>
//   GET    /v1/admin/jobs/:id
//   GET    /v1/admin/jobs/:id/events
//   POST   /v1/admin/jobs/:id/fail        { "reason": "..." }
//   POST   /v1/admin/jobs/:id/reprocess   { "url": "<mp4 url>" }
//   GET    /v1/admin/health-deep            → /v1/health + active job counters
//
//   GET    /v1/admin/kill                   → current kill-switch state
//   POST   /v1/admin/kill                   → activate kill-switch (paused)
//   DELETE /v1/admin/kill                   → clear kill-switch (resume)
//
//   GET    /v1/admin/rate-limits            → live KV counters vs caps
//   GET    /v1/admin/daily-summary?days=N   → 24h (or N-day) rollup
//   GET    /v1/admin/contacts/top?limit=N   → leaderboard by engagement
//   GET    /v1/admin/contacts/:id/videos    → all videos for a contact
//
//   POST   /v1/admin/agents/test            → invoke an agent with a sample
//                                             context; NO HeyGen credit spent.

import { json, error, readJson, nowIso, isKilled, setKillSwitch, killSwitchState } from "../lib/util.js";
import { getVideoJob, updateVideoJob } from "../lib/supabase.js";
import { enqueueOrInline } from "../lib/queue-producer.js";
import { rateLimitState } from "../lib/rate-limit.js";
import { invokeAgent, AGENT_NAMES, agentEndpointVar } from "../lib/agents.js";

function sbHeaders(env) {
  const key = env.SUPABASE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    "apikey": key,
    "Authorization": `Bearer ${key}`,
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

  // ── Agent test runner (zero-cost — no render, no GHL send, just the LLM call) ──
  if (method === "POST" && path === "/agents/test") {
    return agentsTest(env, request);
  }
  if (method === "GET" && path === "/agents/test") {
    return json({
      hint: `POST { agent: ${AGENT_NAMES.map(n => `'${n}'`).join(" | ")}, context?: {...} }`,
      available_agents: AGENT_NAMES,
    });
  }

  if (method !== "GET") return error(405, "method_not_allowed");

  if (path === "/jobs")                          return listJobs(env, url);
  if (path.match(/^\/jobs\/[^/]+\/events$/))     return jobEvents(env, path.split("/")[2]);
  if (path.match(/^\/jobs\/[^/]+\/tracking$/))   return jobTracking(env, path.split("/")[2]);
  if (path.match(/^\/jobs\/[^/]+$/))             return jobDetail(env, path.split("/")[2]);
  if (path === "/health-deep")                   return healthDeep(env);
  if (path === "/rate-limits")                   return json(await rateLimitState(env));
  if (path === "/daily-summary")                 return dailySummary(env, url);
  if (path === "/contacts/top")                  return topContacts(env, url);
  if (path === "/stream-token-test")             return streamTokenTest(env);
  if (path === "/cf-images-test")                return cfImagesTest(env);
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

  // Reset status + clear the processing lock (last_event='processing')
  // so claimJobForProcessing in processOne can re-acquire it on the
  // synthesised queue message below.
  await updateVideoJob(env, jobId, {
    status: "rendering",
    error: null,
    rendered_at: null,
    delivered_at: null,
    failed_at: null,
    last_event: null,
    last_event_at: null,
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

async function dailySummary(env, url) {
  const days = Math.min(parseInt(url.searchParams.get("days") || "1", 10) || 1, 30);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const [jobsR, eventsR] = await Promise.all([
    fetch(
      `${env.SUPABASE_URL}/rest/v1/video_jobs` +
      `?created_at=gte.${encodeURIComponent(since)}` +
      `&select=id,status,render_engine,delivery_channels,engagement_score` +
      `&limit=2000`,
      { headers: sbHeaders(env) }
    ),
    fetch(
      `${env.SUPABASE_URL}/rest/v1/video_events` +
      `?created_at=gte.${encodeURIComponent(since)}` +
      `&select=event,meta&limit=5000`,
      { headers: sbHeaders(env) }
    ),
  ]);
  if (!jobsR.ok || !eventsR.ok) return error(502, "supabase_error");

  const jobs   = await jobsR.json();
  const events = await eventsR.json();

  const byStatus = {};
  const byEngine = {};
  let totalEngagement = 0;
  for (const j of jobs) {
    byStatus[j.status] = (byStatus[j.status] || 0) + 1;
    byEngine[j.render_engine] = (byEngine[j.render_engine] || 0) + 1;
    totalEngagement += (j.engagement_score || 0);
  }

  const eventCounts = {};
  const opensBySrc = {};
  const clicksBySrc = {};
  for (const e of events) {
    eventCounts[e.event] = (eventCounts[e.event] || 0) + 1;
    const src = e.meta?.src;
    if (src) {
      if (e.event === "open")  opensBySrc[src]  = (opensBySrc[src]  || 0) + 1;
      if (e.event === "click") clicksBySrc[src] = (clicksBySrc[src] || 0) + 1;
    }
  }

  const ctr = {};
  for (const ch of ["email", "sms", "conversation"]) {
    const sent   = eventCounts[`sent_${ch}`] || 0;
    const clicks = clicksBySrc[ch] || 0;
    ctr[ch] = {
      sent,
      clicks,
      ctr_pct: sent > 0 ? +(clicks / sent * 100).toFixed(1) : null,
    };
  }

  // Watch funnel — client backfills every crossed threshold (see
  // hosted.js#emitMilestone), so these counts are nested by design:
  // count(25) >= count(50) >= count(75) >= count(100).
  const w25  = eventCounts.watch_25  || 0;
  const w50  = eventCounts.watch_50  || 0;
  const w75  = eventCounts.watch_75  || 0;
  const w100 = eventCounts.watch_100 || 0;

  return json({
    window: { days, since, until: new Date().toISOString() },
    jobs: {
      total: jobs.length,
      by_status: byStatus,
      by_engine: byEngine,
      total_engagement: totalEngagement,
    },
    events: { total: events.length, counts: eventCounts },
    ctr_by_channel: ctr,
    opens_by_src: opensBySrc,
    clicks_by_src: clicksBySrc,
    watch_funnel: { "25": w25, "50": w50, "75": w75, "100": w100 },
    delivery_rate_pct: jobs.length > 0
      ? +((byStatus.delivered || 0) / jobs.length * 100).toFixed(1)
      : null,
  });
}

async function topContacts(env, url) {
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "10", 10) || 10, 50);
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/video_jobs` +
    `?contact_id=not.is.null` +
    `&select=contact_id,status,engagement_score,created_at` +
    `&order=created_at.desc&limit=2000`,
    { headers: sbHeaders(env) }
  );
  if (!r.ok) return error(502, "supabase_error");
  const jobs = await r.json();

  const byContact = {};
  for (const j of jobs) {
    if (!j.contact_id) continue;
    const c = byContact[j.contact_id] = byContact[j.contact_id] || {
      contact_id: j.contact_id,
      total_videos: 0,
      delivered: 0,
      failed: 0,
      total_engagement: 0,
      last_render_at: null,
    };
    c.total_videos++;
    if (j.status === "delivered") c.delivered++;
    if (j.status === "failed")    c.failed++;
    c.total_engagement += (j.engagement_score || 0);
    if (!c.last_render_at || j.created_at > c.last_render_at) {
      c.last_render_at = j.created_at;
    }
  }

  const top = Object.values(byContact)
    .sort((a, b) =>
      (b.total_engagement - a.total_engagement) ||
      (b.total_videos     - a.total_videos)
    )
    .slice(0, limit);

  return json({ count: top.length, contacts: top });
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

// Synthetic contexts used by /v1/admin/agents/test when the caller doesn't
// supply one. Mirrors the shapes the real pipeline passes in production so
// you can iterate on prompt / model changes without burning HeyGen credits.
const AGENT_SAMPLES = {
  heygen_script: {
    contact: {
      first_name: "Maria",
      last_name: "Hernandez",
      email: "maria@example.com",
      phone: "+15551234567",
    },
    lead_intelligence: {
      lead_score: 78,
      ylopo_last_event: "viewed_listing_3x",
      property_interest: "single_family_$450k_$600k",
      neighborhood: "Coral Gables, FL",
      days_in_pipeline: 12,
    },
    listing: {
      address: "123 Sunset Blvd, Coral Gables, FL",
      list_price: 575000,
      beds: 4,
      baths: 3,
      sqft: 2400,
    },
    agent_first_name: "Scott",
    agent_brand: "The Listing Team",
    video_type: "new_listing_match",
  },
  fcpxml_director: {
    listing: {
      address: "123 Sunset Blvd, Coral Gables, FL",
      list_price: 575000,
      beds: 4,
      baths: 3,
      sqft: 2400,
      photos: [
        "https://example.com/photo1.jpg",
        "https://example.com/photo2.jpg",
        "https://example.com/photo3.jpg",
      ],
    },
    agent_brand: "The Listing Team",
    target_platforms: ["tiktok", "instagram_reels", "youtube_shorts"],
  },
  video_delivery: {
    job_id: "vj_test_sample",
    video_type: "new_listing_match",
    hosted_url: "https://videos.reallistingteam.com/v/vj_test_sample",
    gif_url: "https://media.reallistingteam.com/v/vj_test_sample.gif",
    thumbnail_url: "https://media.reallistingteam.com/v/vj_test_sample.jpg",
    contact: {
      first_name: "Maria",
      last_name: "Hernandez",
      email: "maria@example.com",
      phone: "+15551234567",
    },
    cta_url_token: "https://videos.reallistingteam.com/v/vj_test_sample",
    agent_first_name: "Scott",
    agent_brand: "The Listing Team",
    script: "Hi Maria, I just found a beautiful 4-bed in Coral Gables...",
  },
  social_content: {
    listing: {
      address: "123 Sunset Blvd, Coral Gables, FL",
      list_price: 575000,
      beds: 4,
      baths: 3,
    },
    video_url: "https://videos.reallistingteam.com/v/vj_test_sample",
    agent_brand: "The Listing Team",
  },
};

async function agentsTest(env, request) {
  const { body } = await readJson(request);
  const agent = body?.agent;
  if (!agent || !AGENT_SAMPLES[agent]) {
    return error(400, "invalid_agent",
      `agent must be one of: ${Object.keys(AGENT_SAMPLES).join(", ")}`);
  }
  const context = body?.context || AGENT_SAMPLES[agent];
  const startedAt = Date.now();
  try {
    const output = await invokeAgent(env, agent, context);
    const latency_ms = Date.now() - startedAt;
    return json({
      ok: true,
      agent,
      provider: env[agentEndpointVar(agent)]
        ? "agent_studio"
        : (env.AGENT_FALLBACK_PROVIDER || "anthropic"),
      latency_ms,
      context_used: context,
      output,
    });
  } catch (e) {
    return json({
      ok: false,
      agent,
      error: e.message,
      context_used: context,
      latency_ms: Date.now() - startedAt,
    }, 502);
  }
}

// Cheap smoke test for CF_STREAM_API_TOKEN. Hits the Stream listing
// endpoint with limit=1 (no render, no upload, no charge). Reports
// whether the token is missing, rejected, or working — and the HTTP
// status / first error message if Cloudflare rejects it. Use after
// rotating the token to confirm before triggering a real render.
// Same pattern as streamTokenTest. Hits the CF Images listing endpoint
// with per_page=1 — no upload, no cost. Confirms the token has the
// right scope before relying on it for the first real render.
async function cfImagesTest(env) {
  if (!env.CF_ACCOUNT_ID) {
    return json({ ok: false, reason: "CF_ACCOUNT_ID not set" }, 503);
  }
  if (!env.CF_IMAGES_API_TOKEN) {
    return json({ ok: false, reason: "CF_IMAGES_API_TOKEN not set" }, 503);
  }
  if (!env.CF_IMAGES_ACCOUNT_HASH) {
    return json({ ok: false, reason: "CF_IMAGES_ACCOUNT_HASH not set" }, 503);
  }
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/images/v1?per_page=1`,
    { headers: { "Authorization": `Bearer ${env.CF_IMAGES_API_TOKEN}` } }
  );
  let data = null;
  try { data = await r.json(); } catch {}
  return json({
    ok: r.ok && data?.success === true,
    status: r.status,
    cf_success: data?.success ?? null,
    cf_errors: data?.errors ?? null,
    account_hash: env.CF_IMAGES_ACCOUNT_HASH,
    sample_count: Array.isArray(data?.result?.images) ? data.result.images.length : null,
    hint: r.ok && data?.success
      ? "Images token is valid — ready for branded variants + uploads."
      : "Images token is invalid or lacks Cloudflare-Images:Edit scope.",
  }, r.ok && data?.success ? 200 : 502);
}

async function streamTokenTest(env) {
  if (!env.CF_ACCOUNT_ID) {
    return json({ ok: false, reason: "CF_ACCOUNT_ID not set" }, 503);
  }
  if (!env.CF_STREAM_API_TOKEN) {
    return json({ ok: false, reason: "CF_STREAM_API_TOKEN not set" }, 503);
  }
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/stream?limit=1`,
    { headers: { "Authorization": `Bearer ${env.CF_STREAM_API_TOKEN}` } }
  );
  let data = null;
  try { data = await r.json(); } catch {}
  return json({
    ok: r.ok && data?.success === true,
    status: r.status,
    cf_success: data?.success ?? null,
    cf_errors: data?.errors ?? null,
    sample_count: Array.isArray(data?.result) ? data.result.length : null,
    hint: r.ok && data?.success
      ? "Stream token is valid — next render will upload to Stream and use the iframe player."
      : "Stream token is invalid or lacks Stream:Edit. Renders will fall back to native HTML5 player from R2.",
  }, r.ok && data?.success ? 200 : 502);
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
