// Open / click / watch tracking. Updates engagement scores and feeds back
// into the existing lead-scoring pipeline by appending a row to scoring_log
// (READ-ONLY for the existing scoring engine — it just sees a new row).

import { insertVideoEvent, updateVideoJob, getVideoJob, resolveLeadByGhlContactId } from "./supabase.js";
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

// KV-dedupe scoring-bearing events. /v1/analytics/event is unauthenticated
// (so the open pixel + watch heartbeats work from email clients and the
// hosted page without a key), which means anyone with a jobId can POST
// events. The client de-dupes per page-load via window.__sent, but a
// determined caller could still spam events to inflate engagement_score.
// This server-side guard ensures each (jobId, event) pair gets at most
// one score-delta credit globally — re-fired duplicate events still get
// inserted into video_events for traceability, but won't add to score.
const SCORE_DEDUPE_TTL = 60 * 60 * 24 * 30; // 30 days
async function alreadyScored(env, jobId, event) {
  if (!env.VIDEO_KV) return false;
  const key = `score:${jobId}:${event}`;
  const seen = await env.VIDEO_KV.get(key);
  if (seen) return true;
  await env.VIDEO_KV.put(key, "1", { expirationTtl: SCORE_DEDUPE_TTL });
  return false;
}

export async function recordEvent(env, { jobId, event, contactId, meta = {} }) {
  const job = await getVideoJob(env, jobId);
  if (!job) return { ok: false, reason: "job_not_found" };

  const cId = contactId || job.contact_id;
  await insertVideoEvent(env, {
    job_id: jobId, contact_id: cId, event, meta, created_at: nowIso(),
  });

  // Rewatch is the one event that's expected to fire repeatedly per
  // page-load by design (a viewer playing the video again), so it's
  // exempt from the dedupe.
  const isDuplicateScore = event !== "rewatch" && await alreadyScored(env, jobId, event);
  const delta = isDuplicateScore ? 0 : (SCORE_DELTAS[event] || 0);
  if (delta && cId) {
    // scoring_log uses lead_id (uuid) as its FK back to leads. We only
    // know the GHL contact id, so resolve to lead.id first. Schema
    // columns: id, lead_id, score_change, reason, created_at. We pack
    // the metadata (source, job_id, video_type) into the reason string
    // since the table has no jsonb meta column.
    const lead = await resolveLeadByGhlContactId(env, cId).catch(() => null);
    if (lead?.id) {
      const reason = `ai_video:${event}:job=${jobId}:type=${job.video_type}`;
      await fetch(`${env.SUPABASE_URL}/rest/v1/scoring_log`, {
        method: "POST",
        headers: {
          "apikey": env.SUPABASE_KEY || env.SUPABASE_SERVICE_ROLE_KEY,
          "Authorization": `Bearer ${env.SUPABASE_KEY || env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lead_id: lead.id,
          score_change: delta,
          reason,
          created_at: nowIso(),
        }),
      }).catch(() => {});
    }
  }

  // Mirror engagement counters onto the contact's owned fields.
  const patch = {};
  if (event === "open") patch.video_opened = "true";
  if (event === "click" || event === "cta_click") patch.video_clicked = "true";
  if (event.startsWith("watch_")) patch.video_watch_percent = event.replace("watch_", "");

  // Write GHL video_engagement_score for any event that either sets a
  // flag (open / click / watch) OR awards points (delta > 0).
  //
  // Use the already-fetched job row to derive the new cumulative score —
  // no extra DB round-trip needed, and this avoids two races:
  //   1. getContactEngagementTotal only counts status=delivered jobs, so
  //      events on a still-rendering/delivering job would see a stale (low)
  //      total and write the wrong value to GHL.
  //   2. Two concurrent events reading the same stale DB total would each
  //      add their own delta and the second write would overwrite the first.
  // Cross-job aggregation is reconciled by POST /v1/admin/contacts/sync-scores.
  if (cId && (Object.keys(patch).length > 0 || delta > 0)) {
    patch.video_engagement_score = String(Number(job.engagement_score || 0) + delta);
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
