// Hosted video page — the BombBomb-style landing the SMS/email link points to.
//
//   GET /v/:jobId
//
// Renders an HTML page with a Cloudflare Stream player + open pixel +
// click-through tracking on the CTA. Public, but unguessable jobIds.

import { error } from "../lib/util.js";
import { getVideoJob } from "../lib/supabase.js";
import { streamIframe } from "../lib/cf-stream.js";

export default async function hostedRoute(request, env, ctx, url) {
  const parts = url.pathname.split("/").filter(Boolean); // ["v", ":jobId"]
  if (parts[0] !== "v" || !parts[1]) return error(404, "not_found");
  const jobId = parts[1];

  const job = await getVideoJob(env, jobId);
  // Render-not-ready: no job, OR job exists but neither stream_uid nor r2_url is set yet.
  if (!job || (!job.stream_uid && !job.r2_url)) {
    return new Response(notReadyHtml(jobId), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // Fire-and-forget "viewed_page" event
  ctx.waitUntil(
    fetch(`${env.BASE_URL}/v1/analytics/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": env.PROXY_API_KEY || "" },
      body: JSON.stringify({ job_id: jobId, event: "open", meta: { source: "hosted_page" } }),
    }).catch(() => {})
  );

  return new Response(playerHtml(env, job), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

function playerHtml(env, job) {
  const ctaHref = job.cta_url
    ? `${env.BASE_URL}/v1/analytics/click?job=${job.id}&to=${encodeURIComponent(job.cta_url)}`
    : `tel:`;
  const ctaText = job.script_meta?.cta_text || "Schedule a call";
  const title = job.video_type
    ? job.video_type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
    : "Your video";

  // Aspect ratio for the player frame. Defaults to vertical 9/16 for
  // back-compat. Picks up "16:9" / "1:1" / "4:5" if the render set them.
  const aspect = (job.aspect || "9:16").replace(":", "/");
  const isVertical = aspect.startsWith("9/") || aspect.startsWith("4/");
  const wrapMaxWidth = isVertical ? "480px" : "720px";

  // Prefer Cloudflare Stream iframe (HLS/DASH); fall back to native HTML5
  // video tag streaming straight from R2 if Stream wasn't available.
  const playerEl = job.stream_uid
    ? `<iframe src="${streamIframe(job.stream_uid)}?autoplay=true&muted=false&primaryColor=%23ff6a00" allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`
    : `<video id="native-player" src="${escapeHtml(job.r2_url)}" controls autoplay playsinline style="width:100%;height:100%;object-fit:contain;background:#000"></video>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; background:#0a0a0a; color:#fff; font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif; }
  .wrap { max-width: ${wrapMaxWidth}; margin: 0 auto; padding: 16px; }
  .player { aspect-ratio: ${aspect}; width: 100%; background:#000; border-radius:14px; overflow:hidden; }
  .player iframe, .player video { width:100%; height:100%; border:0; }
  h1 { font-size: 18px; margin: 16px 0 4px; }
  .meta { color:#999; font-size: 13px; margin-bottom: 12px; }
  .cta { display:block; text-align:center; margin: 16px 0; padding: 14px 20px; background:#ff6a00; color:#fff; font-weight:600; text-decoration:none; border-radius:10px; }
  .footer { color:#666; font-size:11px; text-align:center; margin-top: 24px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="player">
    ${playerEl}
  </div>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">Personalized for you</div>
  <a class="cta" href="${escapeHtml(ctaHref)}">${escapeHtml(ctaText)}</a>
  <img src="${env.BASE_URL}/v1/analytics/open?job=${job.id}" width="1" height="1" alt="" style="opacity:0">
  <div class="footer">© ${new Date().getFullYear()} The Listing Team</div>
</div>
<script>
  var JOB_ID = "${job.id}";
  var ANALYTICS_URL = "${env.BASE_URL}/v1/analytics/event";
  window.__sent = window.__sent || {};

  function emitMilestone(pct, srcLabel) {
    var bucket = pct >= 100 ? "watch_100"
              : pct >= 75  ? "watch_75"
              : pct >= 50  ? "watch_50"
              : pct >= 25  ? "watch_25"
              : null;
    if (!bucket || window.__sent[bucket]) return;
    window.__sent[bucket] = 1;
    fetch(ANALYTICS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: JOB_ID, event: bucket, meta: { player: srcLabel } })
    });
  }

  // Path 1: Cloudflare Stream iframe — postMessage timeupdate / ended
  window.addEventListener("message", function(e) {
    try {
      var d = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      if (!d || !d.event) return;
      if (d.event === "ended" || d.event === "timeupdate") {
        var pct = d.event === "ended" ? 100 : Math.floor((d.currentTime / d.duration) * 100);
        emitMilestone(pct, "stream");
      }
    } catch (_) {}
  });

  // Path 2: native HTML5 <video> fallback — same milestones via DOM events.
  // Fires only when the page rendered the <video> tag (no stream_uid).
  document.addEventListener("DOMContentLoaded", function() {
    var v = document.getElementById("native-player");
    if (!v) return;
    var rewatchFired = false;
    v.addEventListener("timeupdate", function() {
      if (!v.duration || isNaN(v.duration)) return;
      var pct = Math.floor((v.currentTime / v.duration) * 100);
      emitMilestone(pct, "native");
    });
    v.addEventListener("ended", function() {
      emitMilestone(100, "native");
    });
    v.addEventListener("play", function() {
      if (window.__sent.watch_100 && !rewatchFired) {
        rewatchFired = true;
        fetch(ANALYTICS_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job_id: JOB_ID, event: "rewatch", meta: { player: "native" } })
        });
      }
    });
  });
</script>
</body>
</html>`;
}

function notReadyHtml(jobId) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Video processing</title>
<style>body{font-family:-apple-system,sans-serif;background:#0a0a0a;color:#ddd;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center}</style>
</head><body><div><h1>Your video is still being prepared.</h1><p>Refresh in a minute (job ${escapeHtml(jobId)}).</p></div></body></html>`;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;",
  }[c]));
}
