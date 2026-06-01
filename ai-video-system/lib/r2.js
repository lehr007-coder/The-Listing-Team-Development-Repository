// R2 helpers for storing original MP4s, GIF previews, and JPG thumbnails.

// HeyGen / FCPXML CDN responses are usually fast, but a slow source can
// stall the worker in two distinct places:
//   1. The fetch itself (handled by AbortSignal.timeout below)
//   2. The streaming bucket.put — AbortSignal does NOT stop R2 from
//      waiting on a slow upstream body, so a half-stalled stream could
//      let bucket.put run until Cloudflare's 15-min queue-consumer
//      wall-clock killed the worker externally, leaving the claim
//      dangling with no catch-block error.
//
// Buffering the response body fully BEFORE bucket.put means once fetch
// completes (bounded by the timeout), R2 only sees a fixed-size
// ArrayBuffer — no slow-stream risk. HeyGen MP4s for 30-60s clips run
// 10-50MB; Workers have 128MB heap so this is comfortably safe.
const SOURCE_FETCH_TIMEOUT_MS = 60_000;
const MAX_BUFFER_BYTES = 200 * 1024 * 1024; // 200MB safety cap

export async function putFromUrl(bucket, key, sourceUrl, contentType) {
  const r = await fetch(sourceUrl, { signal: AbortSignal.timeout(SOURCE_FETCH_TIMEOUT_MS) });
  if (!r.ok) throw new Error(`R2 putFromUrl source fetch failed: ${r.status} ${sourceUrl}`);

  const ct = contentType || r.headers.get("Content-Type") || "application/octet-stream";

  // Defensive size check via Content-Length when present
  const declaredLen = parseInt(r.headers.get("Content-Length") || "0", 10);
  if (declaredLen && declaredLen > MAX_BUFFER_BYTES) {
    throw new Error(`R2 putFromUrl refused: Content-Length ${declaredLen} > ${MAX_BUFFER_BYTES}`);
  }

  // Buffer-then-put. arrayBuffer() respects the same AbortSignal.
  const buf = await r.arrayBuffer();
  if (buf.byteLength > MAX_BUFFER_BYTES) {
    throw new Error(`R2 putFromUrl refused: body ${buf.byteLength} > ${MAX_BUFFER_BYTES}`);
  }
  await bucket.put(key, buf, { httpMetadata: { contentType: ct } });
  return { key, contentType: ct, bytes: buf.byteLength };
}

export async function get(bucket, key) {
  return bucket.get(key);
}

export function publicUrlFor(env, kind, key) {
  // kind = "video" | "preview"
  if (kind === "video") return `${env.MEDIA_BASE_URL || env.BASE_URL}/media/v/${key}`;
  return `${env.MEDIA_BASE_URL || env.BASE_URL}/media/p/${key}`;
}
