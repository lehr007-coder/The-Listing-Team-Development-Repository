// Cloudflare Stream client.
// Uploads MP4 by URL → Stream → returns playback HLS/DASH + UID.
// https://developers.cloudflare.com/stream/uploading-videos/upload-video-file/

const STREAM_BASE = (env) => `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/stream`;

function streamHeaders(env) {
  return {
    "Authorization": `Bearer ${env.CF_STREAM_API_TOKEN}`,
    "Content-Type": "application/json",
  };
}

export async function uploadFromUrl(env, sourceUrl, meta = {}) {
  const r = await fetch(`${STREAM_BASE(env)}/copy`, {
    method: "POST",
    headers: streamHeaders(env),
    body: JSON.stringify({
      url: sourceUrl,
      meta,
      requireSignedURLs: meta.requireSignedURLs === true,
      thumbnailTimestampPct: 0.1,
    }),
  });
  const data = await r.json();
  if (!data.success) {
    throw new Error(`Stream uploadFromUrl failed: ${JSON.stringify(data.errors)}`);
  }
  const v = data.result;
  return {
    uid: v.uid,
    playback: v.playback,           // { hls, dash }
    preview: v.preview,
    thumbnail: v.thumbnail,
    readyToStream: v.readyToStream,
  };
}

export async function getStreamVideo(env, uid) {
  const r = await fetch(`${STREAM_BASE(env)}/${uid}`, {
    headers: streamHeaders(env),
  });
  const data = await r.json();
  if (!data.success) return null;
  return data.result;
}

export function streamThumbnailUrl(uid, time = "1s", width = 720) {
  return `https://customer-${uid}.cloudflarestream.com/${uid}/thumbnails/thumbnail.jpg?time=${time}&width=${width}`;
}

export function streamGifUrl(uid, opts = {}) {
  const { start = "0s", duration = "4s", width = 480, height = 854, fps = 12 } = opts;
  return `https://customer-${uid}.cloudflarestream.com/${uid}/thumbnails/thumbnail.gif?` +
    `time=${start}&duration=${duration}&width=${width}&height=${height}&fps=${fps}`;
}

export function streamIframe(uid) {
  return `https://customer-${uid}.cloudflarestream.com/${uid}/iframe`;
}
