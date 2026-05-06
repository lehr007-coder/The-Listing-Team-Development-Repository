// Open / click / watch tracking. Updates engagement scores and feeds back
// into the existing lead-scoring pipeline by appending a row to scoring_log
// (READ-ONLY for the existing scoring engine — it just sees a new row).

import { insertVideoEvent, updateVideoJob, getVideoJob } from "./supabase.js";
import { writeOwnedFields } from "./ghl.js";
import { nowIso } from "./util.js";

const SCORE_DELTAS = {
  open: 2,
  click: 5,
  watch_25: 3,
  watch_50: 5,
  watch_75: 8,
  watch_100: 12,
  cta_click: 15,
  rewatch: 4,
};

export async function recordEvent(env, { jobId, event, contactId, meta = {} }) {
  const job = await getVideoJob(env, jobId);
  if (!job) return { ok: false, reason: "job_not_found" };

  const cId = contactId || job.contact_id;
  await insertVideoEvent(env, {
    job_id: jobId, contact_id: cId, event, meta, created_at: nowIso(),
  });

  const delta = SCORE_DELTAS[event] || 0;
  if (delta && cId) {
    // Append to scoring_log so the existing lead-scoring engine sees it.
    // The proxy worker's scoring engine reads this table and aggregates.
    await fetch(`${env.SUPABASE_URL}/rest/v1/scoring_log`, {
      method: "POST",
      headers: {
        "apikey": env.SUPABASE_KEY,
        "Authorization": `Bearer ${env.SUPABASE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contact_id: cId,
        source: "ai_video",
        delta,
        reason: `video_${event}`,
        meta: { job_id: jobId, video_type: job.video_type, ...meta },
        created_at: nowIso(),
      }),
    }).catch(() => {});
  }

  // Mirror engagement counters onto the contact's owned fields.
  const patch = {};
  if (event === "open") patch.video_opened = "true";
  if (event === "click" || event === "cta_click") patch.video_clicked = "true";
  if (event.startsWith("watch_")) patch.video_watch_percent = event.replace("watch_", "");

  if (cId && Object.keys(patch).length) {
    patch.video_engagement_score = String((Number(job.engagement_score || 0) + delta));
    await writeOwnedFields(env, cId, patch);
  }

  await updateVideoJob(env, jobId, {
    engagement_score: (Number(job.engagement_score || 0) + delta),
    last_event_at: nowIso(),
    last_event: event,
  });

  return { ok: true, delta };
}

// 1x1 transparent GIF for email open pixels
export const PIXEL_GIF = new Uint8Array([
  0x47,0x49,0x46,0x38,0x39,0x61,0x01,0x00,0x01,0x00,0x80,0x00,0x00,
  0xff,0xff,0xff,0x00,0x00,0x00,0x21,0xf9,0x04,0x01,0x00,0x00,0x00,
  0x00,0x2c,0x00,0x00,0x00,0x00,0x01,0x00,0x01,0x00,0x00,0x02,0x02,
  0x44,0x01,0x00,0x3b
]);
