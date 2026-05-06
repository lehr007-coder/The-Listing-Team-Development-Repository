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
import { updateVideoJob, getVideoJob, insertVideoEvent } from "./supabase.js";
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
  const job = await getVideoJob(env, jobId);
  if (!job) throw new Error(`video_job ${jobId} not found`);
  if (job.status === "delivered" || job.status === "failed") return;

  // 1) MP4 → R2 (durable canonical copy)
  const r2Key = `${kind}/${jobId}.mp4`;
  await putFromUrl(env.VIDEO_BUCKET, r2Key, sourceMp4Url, "video/mp4");
  const r2Url = `${env.MEDIA_BASE_URL || env.BASE_URL}/media/v/${r2Key}`;

  // 2) Cloudflare Stream upload (adaptive playback)
  const stream = await streamUpload(env, sourceMp4Url, {
    name: `${kind}-${jobId}`,
  });

  // 3) Hosted page + previews
  const hostedUrl = `${env.HOSTED_BASE_URL || env.BASE_URL}/v/${jobId}`;
  const gifUrl = streamGifUrl(stream.uid, { duration: "4s" });
  const thumbnailUrl = streamThumbnailUrl(stream.uid, "1s", 720);

  // 4) Persist + update GHL
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
  });

  if (job.contact_id) {
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
  }

  await insertVideoEvent(env, {
    job_id: jobId,
    contact_id: job.contact_id,
    event: "rendered",
    meta: { stream_uid: stream.uid },
    created_at: nowIso(),
  });

  // 5) Branch: personal vs social
  if (job.distribution === "social") {
    await runSocialDistribution(env, jobId);
  } else if (job.contact_id) {
    await runDelivery(env, jobId);
  }
}
