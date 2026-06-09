// Admin / debugging endpoints. All gated by PROXY_API_KEY (the route
// table marks /v1/admin as auth=true).
//
//   GET    /v1/admin/jobs?limit=50&contact_id=<>&status=<>
//   GET    /v1/admin/jobs/:id
//   GET    /v1/admin/jobs/:id/events
//   GET    /v1/admin/jobs/:id/diagnose    → why is this job stuck?
//   POST   /v1/admin/jobs/:id/fail        { "reason": "..." }
//   POST   /v1/admin/jobs/:id/reprocess   { "url": "<mp4 url>" }
//   GET    /v1/admin/health-deep            → /v1/health + active job counters
//   GET    /v1/admin/heygen/credits         → HeyGen API credit balance
//
//   GET    /v1/admin/kill                   → current kill-switch state
//   POST   /v1/admin/kill                   → activate kill-switch (paused)
//   DELETE /v1/admin/kill                   → clear kill-switch (resume)
//
//   GET    /v1/admin/rate-limits            → live KV counters vs caps
//   GET    /v1/admin/daily-summary?days=N   → 24h (or N-day) rollup
//   GET    /v1/admin/analytics/summary?days=N  → 30-day analytics rollup
//                                                with per-video-type breakdown
//                                                + daily series for charts
//   POST   /v1/admin/reports/weekly/send     → generate + email the weekly
//                                              report. Body: { dry_run?, days?,
//                                              recipients?:[contact_ids] }
//   GET    /v1/admin/alerts                  → operational health alerts:
//                                              credits, orphans, stuck jobs,
//                                              missing config, kill-switch
//   POST   /v1/admin/jobs/orphan-cleanup     → bulk-mark stale 'rendered' jobs
//                                              as 'failed'. Body: { dry_run?,
//                                              max_rows? } — defaults to dry-run.
//   POST   /v1/admin/contacts/sync-scores   → resync GHL video_engagement_score for
//                                              all contacts with delivered jobs. Body:
//                                              { dry_run?, max? } — defaults to dry_run.
//   GET    /v1/admin/contacts/lookup?email=X → resolve GHL contact_id by email.
//                                              Used to populate WEEKLY_REPORT_CONTACT_IDS.
//   GET    /v1/admin/contacts/top?limit=N   → leaderboard by engagement
//   GET    /v1/admin/contacts/:id/videos    → all videos for a contact
//
//   GET    /v1/admin/ghl/webhooks           → list GHL webhooks for this location
//   POST   /v1/admin/ghl/webhooks/register  → register the ContactTagUpdate webhook (idempotent)
//
//   POST   /v1/admin/agents/test            → invoke an agent with a sample
//                                             context; NO HeyGen credit spent.

import { json, error, readJson, nowIso, isKilled, setKillSwitch, killSwitchState } from "../lib/util.js";
import { getVideoJob, updateVideoJob, listDeliveredEngagementByContact } from "../lib/supabase.js";
import { writeOwnedFields, findContactByEmail } from "../lib/ghl.js";
import { enqueueOrInline } from "../lib/queue-producer.js";
import { processOne } from "../lib/queue-consumer.js";
import { getRenderStatus, getTemplateDetails, listAvatars, getCreditBalance, VIDEO_TYPE_TEMPLATE_VAR } from "../lib/heygen.js";
import { rateLimitState } from "../lib/rate-limit.js";
import { invokeAgent, AGENT_NAMES, agentEndpointVar } from "../lib/agents.js";
import { generateAndSendWeeklyReport } from "../lib/weekly-report.js";
import { summarizeJobs } from "../lib/analytics.js";
import { gatherAlerts, cleanupOrphanedRendered } from "../lib/alerts.js";

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

  // ── Archive HeyGen-hosted MP4 → R2 for permanent storage ──
  // Call this 6-12 hours after delivery (HeyGen URLs expire ~24h).
  // GHL workflow step: POST /v1/admin/jobs/<job_id>/archive
  if (method === "POST" && path.match(/^\/jobs\/[^/]+\/archive$/)) {
    return jobArchive(env, path.split("/")[2]);
  }

  // ── Weekly report — manual / on-demand trigger ──
  if (method === "POST" && path === "/reports/weekly/send") {
    return weeklyReportSend(env, request);
  }

  // ── Phase 9 — orphan cleanup. Bulk-mark stale 'rendered' jobs
  // (older than 6h, younger than 30d) as 'failed' so they don't
  // pollute dashboards. Body: { dry_run?: bool, max_rows?: number }.
  // Defaults to dry_run=true — pass dry_run:false to commit.
  if (method === "POST" && path === "/jobs/orphan-cleanup") {
    return orphanCleanup(env, request);
  }

  // ── Phase 10 — GHL engagement score resync. Recomputes cumulative
  // video_engagement_score for every contact with delivered video jobs and
  // writes it back to GHL. Body: { dry_run?, max? } — dry_run defaults to
  // true. max caps the number of contacts patched (default 50, cap 500).
  if (method === "POST" && path === "/contacts/sync-scores") {
    return contactsSyncScores(env, request, url);
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

  // ── GHL webhook management ──
  // GET  /v1/admin/ghl/webhooks          → list existing GHL webhooks for this location
  // POST /v1/admin/ghl/webhooks/register → register the ContactTagUpdate webhook (idempotent)
  if (method === "GET"  && path === "/ghl/webhooks")          return ghlWebhooksList(env);
  if (method === "POST" && path === "/ghl/webhooks/register") return ghlWebhooksRegister(env);

  if (method !== "GET") return error(405, "method_not_allowed");

  if (path === "/jobs")                          return listJobs(env, url);
  if (path.match(/^\/jobs\/[^/]+\/events$/))     return jobEvents(env, path.split("/")[2]);
  if (path.match(/^\/jobs\/[^/]+\/tracking$/))   return jobTracking(env, path.split("/")[2]);
  if (path.match(/^\/jobs\/[^/]+$/))             return jobDetail(env, path.split("/")[2]);
  if (path === "/health-deep")                   return healthDeep(env);
  if (path === "/heygen/templates")              return listHeygenTemplates(env);
  if (path === "/heygen/avatars")                return json({ avatars: await listAvatars(env) });
  if (path === "/heygen/credits")                return json(await getCreditBalance(env));
  if (path.match(/^\/jobs\/[^/]+\/diagnose$/))   return jobDiagnose(env, path.split("/")[2]);
  if (path === "/rate-limits")                   return json(await rateLimitState(env));
  if (path === "/alerts")                        return json(await gatherAlerts(env));
  if (path === "/daily-summary")                 return dailySummary(env, url);
  if (path === "/analytics/summary")             return analyticsSummary(env, url);
  if (path === "/contacts/lookup")               return contactLookup(env, url);
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

// One-shot diagnostic: given a stuck job, fetch HeyGen's view of the
// video and produce a single readable summary explaining exactly why
// the job is where it is. Designed for ops: never throws, always
// returns a JSON body the dashboard can render.
async function jobDiagnose(env, jobId) {
  const job = await getVideoJob(env, jobId);
  if (!job) return error(404, "not_found");

  const out = {
    job_id: jobId,
    job_status: job.status,
    job_error: job.error || null,
    last_event: job.last_event || null,
    last_event_at: job.last_event_at || null,
    created_at: job.created_at,
    rendered_at: job.rendered_at,
    delivered_at: job.delivered_at,
    has_hosted_url: !!job.hosted_url,
    heygen_video_id: job.heygen_video_id || null,
    heygen: null,
    credits: null,
    diagnosis: "",
  };

  if (job.heygen_video_id) {
    try {
      const hg = await getRenderStatus(env, job.heygen_video_id);
      const d = hg?.data || {};
      out.heygen = {
        status: d.status || null,
        error: d.error || null,
        video_url: d.video_url || null,
        thumbnail_url: d.thumbnail_url || null,
        gif_url: d.gif_url || d.gif_download_url || null,
        duration: d.duration ?? null,
      };
    } catch (e) {
      out.heygen = { error: `getRenderStatus failed: ${e.message}` };
    }
  }

  out.credits = await getCreditBalance(env);

  // Build the diagnosis
  const parts = [];
  if (job.status === "delivered") {
    parts.push("Job successfully delivered.");
  } else if (job.status === "failed") {
    parts.push(`Job marked failed: ${job.error || "no reason recorded"}`);
  } else if (job.status === "rendering" && out.heygen?.status === "completed") {
    parts.push("HeyGen finished but the webhook never fired or did not update the job. Use POST /v1/admin/jobs/:id/reprocess to pull the URL and trigger delivery.");
  } else if (job.status === "rendering" && out.heygen?.status === "failed") {
    parts.push(`HeyGen failed: ${out.heygen.error || "unknown reason"}.`);
  } else if (job.status === "rendering" && out.heygen?.status === "processing") {
    const ageMin = Math.floor((Date.now() - new Date(job.created_at).getTime()) / 60000);
    if (ageMin > 15) {
      parts.push(`HeyGen still processing after ${ageMin} min — unusually slow. Likely cause: credits exhausted mid-render (HeyGen accepts the job, then stalls). Verify credits: see credits panel.`);
    } else {
      parts.push(`HeyGen processing (${ageMin} min in) — within normal range.`);
    }
  } else if (job.status === "rendering" && !job.heygen_video_id) {
    parts.push("Job is rendering but has no heygen_video_id. Render submission may have failed before HeyGen returned an id.");
  } else if (job.status === "rendered" && !job.hosted_url) {
    parts.push("Job marked rendered but hosted_url is null. Delivery refuses to fire — manual reprocess required.");
  } else if (job.status === "rendered") {
    parts.push("Rendered, awaiting delivery. Use POST /v1/admin/jobs/:id/reprocess if delivery did not auto-fire.");
  } else {
    parts.push(`Status=${job.status}; no specific diagnosis available.`);
  }

  if (out.credits?.ok && out.credits.remaining_quota !== null) {
    parts.push(`HeyGen credit balance: ${out.credits.remaining_quota}.`);
    if (out.credits.remaining_quota === 0) {
      parts.push("HEYGEN CREDITS ARE ZERO — no new renders will succeed until topped up.");
    }
  } else if (out.credits && !out.credits.ok) {
    parts.push(`Could not fetch HeyGen credit balance: ${out.credits.error}`);
  }

  out.diagnosis = parts.join(" ");
  return json(out);
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
  let sourceMp4Url = body?.url || body?.video_url || body?.mp4_url;

  // If no URL passed but the job has a heygen_video_id, fetch the URL
  // from HeyGen ourselves (saves the caller from juggling HEYGEN_API_KEY).
  if (!sourceMp4Url && job.heygen_video_id) {
    try {
      const hg = await getRenderStatus(env, job.heygen_video_id);
      sourceMp4Url = hg?.data?.video_url || hg?.data?.url;
    } catch (e) {
      return error(502, "heygen_status_failed", e.message);
    }
  }
  if (!sourceMp4Url) return error(400, "missing_url", "POST { url: '<mp4 url>' } — or ensure job.heygen_video_id is set so the server can resolve via HeyGen status.get");

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

  // sync=true bypasses queue & ctx.waitUntil — awaits processOne
  // in-request so the HTTP response surfaces the actual outcome
  // (and the bug is visible in this single invocation's tail logs).
  if (body?.sync) {
    try {
      await processOne(env, { jobId, sourceMp4Url, kind, skipClaim: true });
      return json({ ok: true, job_id: jobId, kind, sync: true });
    } catch (e) {
      return json({ ok: false, job_id: jobId, kind, sync: true,
        error: e.message, stack: (e.stack || "").split("\n").slice(0, 5).join(" | ") });
    }
  }

  // Default (non-sync) path: AWAIT processOne in-request (same as
  // sync mode below). ctx.waitUntil detached promises were observed
  // to die silently in this runtime, so we await unconditionally.
  // Claim mechanism inside processOne de-dupes concurrent triggers.
  try {
    await processOne(env, { jobId, sourceMp4Url, kind });
    return json({ ok: true, job_id: jobId, kind, dispatched: "await" });
  } catch (e) {
    return json({ ok: false, job_id: jobId, kind, error: e.message,
      stack: (e.stack || "").split("\n").slice(0, 5).join(" | ") });
  }
}

// POST /v1/admin/jobs/:id/archive — copy the HeyGen-hosted MP4 to
// our R2 bucket and rewrite the job's r2_url to point at the
// permanent media.reallistingteam.com URL. Idempotent: if r2_url
// is already on our origin, returns ok with skipped:true.
//
// Designed to be called by the GHL workflow 6-12 hours after the
// delivery step — HeyGen's CDN URLs typically expire ~24h after
// render. After archive, the email's video link will keep working
// forever instead of breaking after a day.
//
// Kept intentionally minimal (one fetch + one R2 put + one DB
// update) to fit comfortably inside Cloudflare's CPU budget.
async function jobArchive(env, jobId) {
  const job = await getVideoJob(env, jobId);
  if (!job) return error(404, "not_found");
  if (!job.r2_url) return error(400, "no_source_url", "Job has no r2_url to archive from");

  const mediaOrigin = env.MEDIA_BASE_URL ? new URL(env.MEDIA_BASE_URL).origin : null;
  let alreadyOnOrigin = false;
  try {
    alreadyOnOrigin = mediaOrigin && new URL(job.r2_url).origin === mediaOrigin;
  } catch {}
  if (alreadyOnOrigin) {
    return json({ ok: true, job_id: jobId, skipped: true, reason: "already_on_origin" });
  }

  const r2Key = `heygen/${jobId}.mp4`;
  try {
    const fetchStart = Date.now();
    const r = await fetch(job.r2_url, { signal: AbortSignal.timeout(60_000) });
    if (!r.ok) {
      throw new Error(`source fetch ${r.status} ${job.r2_url}`);
    }
    const ct = r.headers.get("Content-Type") || "video/mp4";
    const buf = await r.arrayBuffer();
    const putStart = Date.now();
    await env.VIDEO_BUCKET.put(r2Key, buf, { httpMetadata: { contentType: ct } });
    const putMs = Date.now() - putStart;
    const newR2Url = `${env.MEDIA_BASE_URL || env.BASE_URL}/media/v/${r2Key}`;
    await updateVideoJob(env, jobId, {
      r2_key: r2Key,
      r2_url: newR2Url,
    });
    return json({
      ok: true,
      job_id: jobId,
      r2_key: r2Key,
      r2_url: newR2Url,
      bytes: buf.byteLength,
      fetch_ms: Date.now() - fetchStart - putMs,
      put_ms: putMs,
    });
  } catch (e) {
    console.error(`jobArchive(${jobId}) failed:`, e.stack || e.message);
    return json({ ok: false, job_id: jobId, error: e.message }, 500);
  }
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

// Phase 7 — broader window analytics for the admin dashboard chart.
//
// dailySummary covers a 1-day rollup with channel CTR and watch funnel.
// This endpoint covers a multi-day window (default 30) with:
//   • per-day series (renders + delivered counts) for chart rendering
//   • per-video-type rollup with delivery success rate
//   • overall delivery + engagement totals
//
// Phase 9 — delegated to lib/analytics.js#summarizeJobs so the dashboard
// and the weekly report email always show the same numbers for the same
// window. The shared helper also fixes the avg_engagement quirk where
// engagement was averaged across all statuses but divided by delivered.
async function analyticsSummary(env, url) {
  const days = Math.min(parseInt(url.searchParams.get("days") || "30", 10) || 30, 90);
  try {
    return json(await summarizeJobs(env, days));
  } catch (e) {
    return error(502, "supabase_error", e.message);
  }
}

// Phase 8 — POST /v1/admin/reports/weekly/send.
// Body: { dry_run?: bool, days?: number, recipients?: [contact_id, ...] }
//   - dry_run: render the report + recipients but skip the GHL sends.
//   - days: override window (default 7, capped at 90).
//   - recipients: override the WEEKLY_REPORT_CONTACT_IDS env list.
// Returns the same JSON shape generateAndSendWeeklyReport produces, including
// per-recipient delivery result. Errors are caught and surfaced as an `ok:false`
// JSON body so callers can distinguish "all recipients failed" from
// "request never started".
async function weeklyReportSend(env, request) {
  const { body } = await readJson(request);
  try {
    const out = await generateAndSendWeeklyReport(env, {
      days: body?.days,
      recipients: Array.isArray(body?.recipients) ? body.recipients : undefined,
      dryRun: !!body?.dry_run,
    });
    return json(out);
  } catch (e) {
    console.error(`weeklyReportSend failed:`, e.stack || e.message);
    return json({
      ok: false,
      reason: "internal_error",
      error: e.message,
      stack: (e.stack || "").split("\n").slice(0, 5).join(" | "),
    }, 500);
  }
}

// Phase 9 — POST /v1/admin/jobs/orphan-cleanup
// Body: { dry_run?: bool (default true), max_rows?: number (default 50, cap 200) }
// Defaults to dry-run for safety — explicitly pass {dry_run:false} to commit.
async function orphanCleanup(env, request) {
  const { body } = await readJson(request);
  const dryRun = body?.dry_run !== false;  // default to true
  const maxRows = parseInt(body?.max_rows || "50", 10) || 50;
  try {
    const out = await cleanupOrphanedRendered(env, { dryRun, maxRows });
    return json(out);
  } catch (e) {
    console.error(`orphanCleanup failed:`, e.stack || e.message);
    return json({ ok: false, reason: "internal_error", error: e.message }, 500);
  }
}

// Phase 10 — POST /v1/admin/contacts/sync-scores
// Recomputes cumulative video_engagement_score (across all delivered jobs)
// for every contact and writes it back to GHL. Useful after a schema migration,
// a bulk re-import, or to correct scores that drifted while tracking.js
// was writing per-job scores instead of cumulative totals.
//
// Body: { dry_run?: bool (default true), max?: number (default 50, cap 500) }
// dry_run=true returns the computed scores without touching GHL.
async function contactsSyncScores(env, request, url) {
  const { body } = await readJson(request);
  const dryRun = body?.dry_run !== false;
  const max = Math.min(parseInt(body?.max || "50", 10) || 50, 500);

  if (!env.SUPABASE_URL || !(env.SUPABASE_KEY || env.SUPABASE_SERVICE_ROLE_KEY)) {
    return error(503, "no_supabase", "Supabase not configured");
  }
  if (!dryRun && !(env.GHL_V2_TOKEN || env.GHL_API_KEY)) {
    return error(503, "no_ghl_credentials", "GHL credentials required for live sync — pass dry_run:true to preview");
  }

  let contacts;
  try {
    // listDeliveredEngagementByContact fetches up to 2000 delivered job rows
    // and groups+sums in-memory, returning [{contact_id, total}] sorted by total desc.
    contacts = await listDeliveredEngagementByContact(env, { limit: 2000 });
  } catch (e) {
    return error(502, "supabase_error", e.message);
  }

  const total_contacts_with_videos = contacts.length;
  const batch = contacts.slice(0, max);

  if (dryRun) {
    return json({
      ok: true,
      dry_run: true,
      total_contacts_with_videos,
      contacts_in_batch: batch.length,
      truncated: total_contacts_with_videos > max,
      preview: batch,
    });
  }

  // Live: parallel GHL writes, bounded by `max` (Cloudflare subrequest-safe
  // since max is capped at 500 and each contact is one GHL PUT).
  const settled = await Promise.allSettled(
    batch.map(({ contact_id, total }) =>
      writeOwnedFields(env, contact_id, { video_engagement_score: String(total) })
        .then(() => ({ contact_id, score: total, ok: true }))
        .catch(e => ({ contact_id, score: total, ok: false, error: e.message }))
    )
  );
  const results = settled.map(s => s.status === "fulfilled" ? s.value : { ...s.reason, ok: false });
  const synced = results.filter(r => r.ok).length;

  return json({
    ok: synced > 0 || batch.length === 0,
    total_contacts_with_videos,
    contacts_attempted: batch.length,
    contacts_synced: synced,
    contacts_failed: batch.length - synced,
    truncated: total_contacts_with_videos > max,
    results,
  });
}

// GET /v1/admin/contacts/lookup?email=lehr007@gmail.com
// Resolve a GHL contact_id by email so ops can populate
// WEEKLY_REPORT_CONTACT_IDS without digging through the GHL UI.
async function contactLookup(env, url) {
  const email = (url.searchParams.get("email") || "").trim().toLowerCase();
  if (!email) return error(400, "missing_email", "Pass ?email=foo@bar.com");
  if (!(env.GHL_V2_TOKEN || env.GHL_API_KEY)) {
    return error(503, "no_ghl_credentials", "GHL_V2_TOKEN or GHL_API_KEY required");
  }
  try {
    const c = await findContactByEmail(env, email);
    if (!c) return json({ ok: false, email, found: false });
    return json({
      ok: true,
      email,
      found: true,
      contact_id: c.id,
      first_name: c.firstName || null,
      last_name: c.lastName || null,
      location_id: c.locationId || null,
    });
  } catch (e) {
    return error(502, "ghl_error", e.message);
  }
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
  // Allow clearing via POST when DELETE is blocked by WAF/proxy
  if (body?.action === "clear" || body?.kill === false) {
    return killClear(env);
  }
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

// GET /v1/admin/heygen/templates
// Joins our video_type → template-ID config with HeyGen's template
// metadata (name, thumbnail, variables) so the admin gallery can render
// a card per template. Templates without an env var are listed with
// status="unconfigured"; templates whose HeyGen fetch fails are listed
// with status="fetch_failed" so missing avatars don't hide the row.
async function listHeygenTemplates(env) {
  const entries = await Promise.all(
    Object.entries(VIDEO_TYPE_TEMPLATE_VAR).map(async ([videoType, varName]) => {
      const templateId = env[varName] || null;
      const row = {
        video_type: videoType,
        env_var: varName,
        template_id: templateId,
        edit_url: templateId
          ? `https://app.heygen.com/templates/${templateId}`
          : "https://app.heygen.com/templates",
      };
      if (!templateId) return { ...row, status: "unconfigured" };
      const details = await getTemplateDetails(env, templateId);
      if (!details) return { ...row, status: "fetch_failed" };
      return {
        ...row,
        status: "ok",
        name: details.name || details.title || null,
        // HeyGen template responses use varying field names by API
        // version — try every common variant before giving up.
        thumbnail_url:
          details.thumbnail_image_url ||
          details.thumbnail_url ||
          details.cover_image_url ||
          details.cover_url ||
          details.image_url ||
          details.preview_image_url ||
          null,
        video_url: details.video_url || details.preview_video_url || null,
        variables: Object.keys(details.variables || {}),
        _raw_keys: Object.keys(details).slice(0, 20),  // debug aid until field names stabilize
      };
    })
  );
  return json({ templates: entries });
}

async function healthDeep(env) {
  const isProduction = env.ENVIRONMENT === "production";
  const out = {
    service: "ai-video-system",
    env: env.ENVIRONMENT,
    build: "v4-2026-06-02-await-pipeline",
    heygen_mode: isProduction ? "live (paid credits)" : "test (free)",
    cron_enabled: false,
    delivery_path: "heygen_webhook_only",
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

// ── GHL webhook management ────────────────────────────────────────────────

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VER  = "2021-07-28";

function ghlAuthHeaders(env) {
  const token = env.GHL_V2_TOKEN || env.GHL_API_KEY;
  if (!token) throw new Error("GHL_V2_TOKEN / GHL_API_KEY secret not set");
  return {
    "Authorization": `Bearer ${token}`,
    "Version": GHL_VER,
    "Content-Type": "application/json",
  };
}

async function ghlWebhooksList(env) {
  const locId = env.GHL_LOCATION_ID;
  if (!locId) return error(500, "missing_config", "GHL_LOCATION_ID not set");
  const r = await fetch(
    `${GHL_BASE}/webhooks/?altId=${encodeURIComponent(locId)}&altType=location`,
    { headers: ghlAuthHeaders(env) }
  );
  if (!r.ok) {
    const txt = await r.text();
    return error(502, "ghl_error", `GHL list webhooks failed: ${r.status} ${txt}`);
  }
  return json(await r.json());
}

async function ghlWebhooksRegister(env) {
  const locId  = env.GHL_LOCATION_ID;
  const apiKey = env.PROXY_API_KEY;
  if (!locId)  return error(500, "missing_config", "GHL_LOCATION_ID not set");
  if (!apiKey) return error(500, "missing_config", "PROXY_API_KEY not set");

  const webhookUrl = `${env.BASE_URL}/v1/ghl/webhook?token=${apiKey}`;
  const name = "AI Video — Tag Trigger";

  // Check for an existing registration to keep this idempotent
  const listR = await fetch(
    `${GHL_BASE}/webhooks/?altId=${encodeURIComponent(locId)}&altType=location`,
    { headers: ghlAuthHeaders(env) }
  );
  if (listR.ok) {
    const listData = await listR.json();
    const webhooks = listData.webhooks || (Array.isArray(listData) ? listData : []);
    const existing = webhooks.find?.(w => w.name === name || w.url?.startsWith(`${env.BASE_URL}/v1/ghl/webhook`));
    if (existing) {
      return json({ ok: true, already_registered: true, webhook: existing });
    }
  }

  // GHL v2: altId/altType as query params; body uses altId/altType (not locationId)
  const r = await fetch(`${GHL_BASE}/webhooks/?altId=${encodeURIComponent(locId)}&altType=location`, {
    method: "POST",
    headers: ghlAuthHeaders(env),
    body: JSON.stringify({
      altId: locId,
      altType: "location",
      name,
      url: webhookUrl,
      events: ["ContactTagUpdate"],
    }),
  });

  if (!r.ok) {
    const txt = await r.text();
    return error(502, "ghl_error", `GHL register webhook failed: ${r.status} ${txt}`);
  }

  const webhook = await r.json();
  return json({ ok: true, registered: true, webhook });
}
