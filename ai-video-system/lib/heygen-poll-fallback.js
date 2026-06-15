// Cron-driven safety net for HeyGen renders whose webhook never fires.
//
// HeyGen's v2 /video/generate sometimes silently drops the per-request
// callback_url (we've observed callback_id coming back null on their
// v1 status endpoint). Without a callback, jobs stay in 'rendering'
// forever even after HeyGen has produced the file.
//
// This module is invoked from worker.js#scheduled (Cloudflare cron).
// Once per minute it:
//   1. Finds video_jobs where status='rendering', render_engine='HEYGEN',
//      heygen_video_id IS NOT NULL, created_at > now()-24h, < now()-60s
//      (give the real callback a chance first; cap at 24h so we don't
//      keep polling forever for genuinely failed renders)
//   2. For each, queries HeyGen v1 status.get
//   3. If HeyGen says "completed", fires a self-fetch to
//      POST /v1/admin/jobs/:id/reprocess — each job runs processOne in
//      its own fresh HTTP handler Worker invocation, avoiding the
//      scheduled handler CPU limit that silently kills long pipelines
//   4. If HeyGen says "failed", marks the job failed with the error

import { getRenderStatus } from "./heygen.js";
import { updateVideoJob } from "./supabase.js";

const POLL_MIN_AGE_S = 60;                  // give real callback a chance first
const POLL_MAX_AGE_S = 24 * 60 * 60;        // stop after 24 hours — wide enough
                                            // to self-heal multi-hour Supabase
                                            // outages without leaving rows
                                            // permanently stuck in 'rendering'.
                                            // HeyGen MP4 URLs typically remain
                                            // fetchable for ~24h after render.
const POLL_BATCH = 10;                      // cap per-tick

export async function runHeygenPollFallback(env, ctx) {
  const startTime = Date.now();
  console.log("poll-fallback: cron triggered, looking for stuck jobs");

  if (!env.SUPABASE_URL || !(env.SUPABASE_KEY || env.SUPABASE_SERVICE_ROLE_KEY)) {
    console.warn("poll-fallback: skipped — no supabase config");
    return { skipped: "no_supabase" };
  }
  if (!env.HEYGEN_API_KEY) {
    console.warn("poll-fallback: skipped — no heygen api key");
    return { skipped: "no_heygen_key" };
  }
  if (!env.PROXY_API_KEY) {
    console.warn("poll-fallback: skipped — no PROXY_API_KEY (needed to auth reprocess self-fetch)");
    return { skipped: "no_proxy_api_key" };
  }
  if (!env.BASE_URL) {
    console.warn("poll-fallback: skipped — no BASE_URL (needed to build reprocess self-fetch URL)");
    return { skipped: "no_base_url" };
  }

  // RLS is off on video_jobs/video_events so SUPABASE_KEY works.
  const sbKey = env.SUPABASE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const sbHeaders = {
    "apikey": sbKey,
    "Authorization": `Bearer ${sbKey}`,
    "Content-Type": "application/json",
  };

  const minAge = new Date(Date.now() - POLL_MIN_AGE_S * 1000).toISOString();
  const maxAge = new Date(Date.now() - POLL_MAX_AGE_S * 1000).toISOString();
  const url = `${env.SUPABASE_URL}/rest/v1/video_jobs` +
    `?status=eq.rendering` +
    `&render_engine=eq.HEYGEN` +
    `&heygen_video_id=not.is.null` +
    `&created_at=lt.${encodeURIComponent(minAge)}` +
    `&created_at=gt.${encodeURIComponent(maxAge)}` +
    `&order=created_at.asc&limit=${POLL_BATCH}`;

  console.log("poll-fallback: querying stuck jobs (status=rendering, created between 60s-24h ago)");
  const r = await fetch(url, { headers: sbHeaders });
  if (!r.ok) {
    const errText = await r.text();
    console.error(`poll-fallback: list failed: HTTP ${r.status} — ${errText.slice(0, 200)}`);
    return { skipped: "list_failed", status: r.status };
  }
  const stuck = await r.json();
  if (stuck.length === 0) {
    console.log("poll-fallback: no stuck jobs found");
    return { checked: 0 };
  }
  console.log(`poll-fallback: found ${stuck.length} stuck job(s), processing...`);

  const out = { checked: stuck.length, recovered: 0, failed_marked: 0, still_processing: 0 };

  for (const job of stuck) {
    try {
      const hg = await getRenderStatus(env, job.heygen_video_id);
      const data = hg?.data || {};
      const hgStatus = data.status;
      console.log(`poll-fallback: job ${job.id} heygen_video=${job.heygen_video_id} hg_status=${hgStatus}`);

      if (hgStatus === "failed") {
        await updateVideoJob(env, job.id, {
          status: "failed",
          error: `heygen render failed (poll-fallback): ${data.error?.message || "unknown"}`,
          failed_at: new Date().toISOString(),
        });
        out.failed_marked++;
        continue;
      }

      if (hgStatus === "completed" && data.video_url) {
        // Fire a self-fetch to the reprocess endpoint instead of calling
        // processOne directly. Each job gets its own fresh HTTP-handler Worker
        // invocation with its own CPU budget, so a long R2+Stream+delivery
        // pipeline cannot be silently killed by the scheduled-handler's CPU
        // limit. ctx.waitUntil keeps the cron alive long enough to dispatch
        // all jobs without blocking on each one individually.
        const reprocessUrl = `${env.BASE_URL}/v1/admin/jobs/${job.id}/reprocess`;
        const p = fetch(reprocessUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.PROXY_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url: data.video_url }),
        })
          .then(r => r.json())
          .then(res => {
            // Only count as recovered once the reprocess endpoint confirms ok.
            // Incrementing before the fetch resolves caused failed recoveries
            // to be logged as successful, masking permanently-stuck jobs.
            if (res.ok) out.recovered++;
            console.log(`poll-fallback: reprocess dispatched ${job.id} — ok=${res.ok}`);
          })
          .catch(e => console.error(`poll-fallback: reprocess self-fetch failed ${job.id}:`, e.message));
        ctx.waitUntil(p);
        continue;
      }

      out.still_processing++;
    } catch (e) {
      console.error(`poll-fallback: job ${job.id} errored:`, e.message);
    }
  }

  const elapsed = Date.now() - startTime;
  console.log(`poll-fallback: complete in ${elapsed}ms — recovered=${out.recovered}, failed=${out.failed_marked}, still_processing=${out.still_processing}`);
  return { ...out, elapsed_ms: elapsed };
}
