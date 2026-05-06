// Social distribution.
//
// ONLY runs for jobs marked distribution="social". Personal videos must never
// reach this code path — runDelivery() refuses social jobs and runSocial
// refuses non-social jobs as a defence-in-depth measure.

import { getVideoJob, updateVideoJob, insertVideoEvent } from "./supabase.js";
import { invokeAgent } from "./agents.js";
import { nowIso } from "./util.js";

const SUPPORTED_PLATFORMS = [
  "tiktok",
  "instagram_reels",
  "instagram_stories",
  "facebook_reels",
  "facebook_stories",
  "youtube_shorts",
];

export async function runSocialDistribution(env, jobId) {
  const job = await getVideoJob(env, jobId);
  if (!job) throw new Error(`runSocial: job ${jobId} not found`);
  if (job.distribution !== "social") {
    throw new Error(`runSocial refused: job ${jobId} is not social`);
  }

  // Generate per-platform copy
  const social = await invokeAgent(env, "social_content", {
    job_id: jobId,
    video_type: job.video_type,
    hosted_url: job.hosted_url,
    listing: job.listing_data || null,
    director_output: job.scene_plan || null,
  });

  const targets = (job.social_targets || []).filter(t => SUPPORTED_PLATFORMS.includes(t));
  const results = {};

  for (const platform of targets) {
    try {
      results[platform] = await dispatchPlatform(env, platform, job, social[platform] || {});
      await insertVideoEvent(env, {
        job_id: jobId, contact_id: null,
        event: `posted_${platform}`, meta: {}, created_at: nowIso(),
      });
    } catch (e) {
      console.error(`social dispatch ${platform} failed:`, e.message);
      results[`${platform}_error`] = e.message;
    }
  }

  await updateVideoJob(env, jobId, {
    status: "delivered",
    delivered_at: nowIso(),
    delivery_results: results,
    social_copy: social,
  });

  return { jobId, results };
}

// Each dispatch hits the existing GHL Social Planner queue OR a configured
// Buffer/Hootsuite/Make webhook. We do NOT replace the existing publishing
// pipeline — we hand off to it.
async function dispatchPlatform(env, platform, job, copy) {
  const webhookVar = `SOCIAL_${platform.toUpperCase()}_WEBHOOK`;
  const url = env[webhookVar] || env.SOCIAL_DEFAULT_WEBHOOK;
  if (!url) {
    return { skipped: true, reason: `${webhookVar} not configured` };
  }

  const payload = {
    job_id: job.id,
    platform,
    video_url: job.hosted_url,
    mp4_url: job.r2_url,
    thumbnail_url: job.thumbnail_url,
    gif_url: job.gif_url,
    aspect: job.aspect || "9:16",
    caption: copy.caption || copy.description || copy.hook || "",
    hashtags: copy.hashtags || [],
    title: copy.title || "",
    schedule_at: job.scheduled_post_at || null,
  };

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": env.SOCIAL_DISPATCH_API_KEY || "",
    },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`${platform} webhook failed: ${r.status} ${await r.text()}`);
  return r.json().catch(() => ({ ok: true }));
}
