// R2 helpers for storing original MP4s, GIF previews, and JPG thumbnails.

// HeyGen / FCPXML CDN responses are usually fast, but a hung source URL
// would otherwise let putFromUrl run until Cloudflare's wall-clock limit
// kills the worker — and a worker killed externally never runs the
// processOne catch block, leaving the row's processing-claim dangling.
// 60s gives a typical 50MB MP4 plenty of headroom while ensuring a
// stalled source fails fast and surfaces as a normal step error.
const SOURCE_FETCH_TIMEOUT_MS = 60_000;

export async function putFromUrl(bucket, key, sourceUrl, contentType) {
  const r = await fetch(sourceUrl, { signal: AbortSignal.timeout(SOURCE_FETCH_TIMEOUT_MS) });
  if (!r.ok) throw new Error(`R2 putFromUrl source fetch failed: ${r.status} ${sourceUrl}`);
  const ct = contentType || r.headers.get("Content-Type") || "application/octet-stream";
  await bucket.put(key, r.body, { httpMetadata: { contentType: ct } });
  return { key, contentType: ct };
}

export async function get(bucket, key) {
  return bucket.get(key);
}

export function publicUrlFor(env, kind, key) {
  // kind = "video" | "preview"
  if (kind === "video") return `${env.MEDIA_BASE_URL || env.BASE_URL}/media/v/${key}`;
  return `${env.MEDIA_BASE_URL || env.BASE_URL}/media/p/${key}`;
}
