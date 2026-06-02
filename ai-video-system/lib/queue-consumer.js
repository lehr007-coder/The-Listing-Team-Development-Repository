// Render-queue consumer.
//
// Producers: HeyGen + FCPXML callback handlers push a "post-process" message
// once the upstream renderer reports completion. The consumer:
//   1) downloads the MP4 to R2
//   2) uploads to Cloudflare Stream
//   3) generates GIF preview + thumbnail URLs (via Stream)
//   4) updates video_jobs row + GHL custom fields
//   5) for personal videos, runs delivery (SMS/email/conversation)
//   6) for social videos, hands off to social distribution

import { putFromUrl } from "./r2.js";
import { uploadFromUrl as streamUpload, streamThumbnailUrl, streamGifUrl } from "./cf-stream.js";
import { uploadFromUrl as cfImagesUpload, imageUrl as cfImageVariantUrl } from "./cf-images.js";
import { updateVideoJob, getVideoJob, insertVideoEvent, claimJobForProcessing } from "./supabase.js";
import { writeOwnedFields } from "./ghl.js";
import { runDelivery } from "./delivery.js";
import { runSocialDistribution } from "./social.js";
import { nowIso } from "./util.js";

export async function processRenderQueueBatch(batch, env, ctx) {
  for (const msg of batch.messages) {
    try {
      await processOne(env, msg.body);
      msg.ack();
    } catch (e) {
      console.error("queue processOne failed:", e.message);
      msg.retry({ delaySeconds: 30 });
    }
  }
}

export async function processOne(env, body) {
  const { jobId, sourceMp4Url, kind } = body;

  // Step-by-step error capture so failures show up via /v1/admin/jobs/<id>
  // instead of disappearing into worker logs we can't access.
  let step = "init";
  const t0 = Date.now();
  const stepLog = (s) => console.log(`processOne ${jobId} ENTER step=${s} +${Date.now()-t0}ms`);
  try {
    step = "get_job"; stepLog(step);
    const job = await getVideoJob(env, jobId);
    if (!job) throw new Error(`video_job ${jobId} not found`);
    if (job.status === "delivered" || job.status === "failed") return;

    // Atomic claim. Two paths can dispatch processing for the same job
    // at almost the same time — the real HeyGen webhook hits
    // /v1/heygen/callback at the same minute the cron poll-fallback
    // notices the job and synthesises its own dispatch. The KV dedupe
    // in the callback handler doesn't cover the cron path, so we lock
    // here at the database level: only one processOne for any given
    // job ever runs end-to-end. The loser returns immediately without
    // doing R2 / Stream / GHL work.
    step = "claim"; stepLog(step);
    const claimed = await claimJobForProcessing(env, jobId);
    if (!claimed) {
      console.log(`processOne ${jobId}: lost claim race, skipping`);
      return;
    }

    step = "r2_put"; stepLog(step);
    const r2Key = `${kind}/${jobId}.mp4`;
    await putFromUrl(env.VIDEO_BUCKET, r2Key, sourceMp4Url, "video/mp4");
    const r2Url = `${env.MEDIA_BASE_URL || env.BASE_URL}/media/v/${r2Key}`;

    // Stream upload is best-effort. If CF_STREAM_API_TOKEN doesn't have
    // Stream:Edit (or is otherwise rejected), fall back to serving the
    // MP4 directly from R2 — the hosted page handles both shapes.
    step = "stream_upload"; stepLog(step);
    let stream = { uid: null, playback: {} };
    try {
      stream = await streamUpload(env, sourceMp4Url, { name: `${kind}-${jobId}` });
    } catch (e) {
      console.warn(`stream_upload failed (non-fatal, falling back to R2 direct):`, e.message);
    }

    step = "build_urls"; stepLog(step);
    const hostedUrl = `${env.HOSTED_BASE_URL || env.BASE_URL}/v/${jobId}`;
    const gifUrl = stream.uid ? streamGifUrl(stream.uid, { duration: "4s" }) : null;
    const streamThumbUrl = stream.uid ? streamThumbnailUrl(stream.uid, "1s", 720) : null;

    // Opportunistically host the JPG thumbnail via CF Images (when both
    // a Stream thumbnail exists AND the CF_IMAGES_API_TOKEN is wired).
    // Better delivery than Stream's thumbnail CDN and unlocks branded
    // variants — once a user defines a "branded" variant in CF Images
    // dashboard (logo overlay etc.), they can swap "public" for
    // "branded" in cfImageVariantUrl() with no other code change.
    // Best-effort: falls back to the Stream thumbnail URL if anything
    // goes wrong.
    step = "cf_images_thumbnail"; stepLog(step);
    let thumbnailUrl = streamThumbUrl;
    if (streamThumbUrl && env.CF_IMAGES_API_TOKEN && env.CF_IMAGES_ACCOUNT_HASH) {
      try {
        const img = await cfImagesUpload(env, streamThumbUrl, {
          id: `thumb-${jobId}`,
          metadata: { job_id: jobId, video_type: job.video_type, kind },
        });
        thumbnailUrl = cfImageVariantUrl(env, img.id, "public");
      } catch (e) {
        console.warn(`cf_images thumbnail upload failed (non-fatal):`, e.message);
      }
    }

    step = "update_video_job_rendered"; stepLog(step);
    await updateVideoJob(env, jobId, {
      status: "rendered",
      r2_key: r2Key,
      r2_url: r2Url,
      stream_uid: stream.uid,
      stream_hls: stream.playback?.hls || null,
      stream_dash: stream.playback?.dash || null,
      hosted_url: hostedUrl,
      gif_url: gifUrl,
      thumbnail_url: thumbnailUrl,
      rendered_at: nowIso(),
      error: null,
    });

    if (job.contact_id) {
      step = "ghl_write_owned_fields"; stepLog(step);
      try {
        await writeOwnedFields(env, job.contact_id, {
          video_status: "rendered",
          video_url: hostedUrl,
          video_gif_url: gifUrl,
          video_thumbnail_url: thumbnailUrl,
          video_last_rendered: nowIso(),
          video_render_engine: kind === "heygen" ? "HEYGEN" : "FCPXML",
          ai_video_type: job.video_type,
          last_video_type: job.video_type,
        });
      } catch (e) {
        // Non-fatal — render itself succeeded.
        console.error(`writeOwnedFields(${job.contact_id}) failed (non-fatal):`, e.message);
      }
    }

    step = "insert_event_rendered"; stepLog(step);
    await insertVideoEvent(env, {
      job_id: jobId,
      contact_id: job.contact_id,
      event: "rendered",
      meta: { stream_uid: stream.uid },
      created_at: nowIso(),
    });

    if (job.distribution === "social") {
      step = "social_distribution"; stepLog(step);
      await runSocialDistribution(env, jobId);
    } else if (job.contact_id) {
      step = "delivery"; stepLog(step);
      await runDelivery(env, jobId);
    }
    console.log(`processOne ${jobId} DONE +${Date.now()-t0}ms`);
  } catch (e) {
    const msg = `step=${step}: ${e.message || e}`;
    console.error(`processOne ${jobId} ${msg}`);
    try {
      await updateVideoJob(env, jobId, {
        error: msg.slice(0, 500),
        last_event: `process_failed_at_${step}`,
        last_event_at: nowIso(),
      });
    } catch {}
    throw e;
  }
}
