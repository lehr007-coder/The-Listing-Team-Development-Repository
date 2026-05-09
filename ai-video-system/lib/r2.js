// R2 helpers for storing original MP4s, GIF previews, and JPG thumbnails.

export async function putFromUrl(bucket, key, sourceUrl, contentType) {
  const r = await fetch(sourceUrl);
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
