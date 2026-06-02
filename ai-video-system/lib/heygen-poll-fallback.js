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
//      heygen_video_id IS NOT NULL, created_at > now()-30m, < now()-60s
//      (give the real callback a chance first; cap at 30m so we don't
//      keep polling forever for genuinely failed renders)
//   2. For each, queries HeyGen v1 status.get
//   3. If HeyGen says "completed" + has video_url, synthesises the
//      callback payload and dispatches it through the same code path
//      a real callback would use (queue / inline processOne)
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
  if (!env.SUPABASE_URL || !(env.SUPABASE_KEY || env.SUPABASE_SERVICE_ROLE_KEY)) return { skipped: "no_supabase" };
  if (!env.HEYGEN_API_KEY) return { skipped: "no_heygen_key" };

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

  const r = await fetch(url, { headers: sbHeaders });
  if (!r.ok) {
    console.error("poll-fallback: list failed", r.status, await r.text());
    return { skipped: "list_failed" };
  }
  const stuck = await r.json();
  if (stuck.length === 0) return { checked: 0 };

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
        // Re-enter the proven HTTP-handler path by POSTing to our own
        // /v1/admin/jobs/:id/reprocess. The admin endpoint dispatches
        // processOne via ctx.waitUntil in HTTP-handler context — the
        // only path observed to actually run the pipeline to delivery.
        // (Direct enqueueOrInline / queue-consumer dispatch was killed
        // silently after the claim step.) Kicked via ctx.waitUntil so
        // the cron tick completes without blocking on the pipeline.
        ctx.waitUntil(
          fetch(`${env.BASE_URL}/v1/admin/jobs/${job.id}/reprocess`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${env.PROXY_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ url: data.video_url }),
          })
            .then(r => r.text())
            .then(t => console.log(`poll-fallback: reprocess dispatch for ${job.id}:`, t.slice(0, 200)))
            .catch(e => console.error(`poll-fallback: reprocess dispatch failed for ${job.id}:`, e.message))
        );
        out.recovered++;
        continue;
      }

      out.still_processing++;
    } catch (e) {
      console.error(`poll-fallback: job ${job.id} errored:`, e.message);
    }
  }

  return out;
}
