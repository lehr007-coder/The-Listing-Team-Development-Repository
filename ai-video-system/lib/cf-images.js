// Cloudflare Images client.
// Used for thumbnail variants, branded overlays on JPG previews, and resizing.
// GIFs are produced by Cloudflare Stream's gif endpoint (see cf-stream.js).

const IMG_BASE = (env) => `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/images/v1`;

// Cap every CF Images API call so a hung CF backend can't burn the
// queue consumer's 15-min wall-clock. Same defensive pattern as
// cf-stream.js and r2.js.
const CF_IMAGES_TIMEOUT_MS = 30_000;

export async function uploadFromUrl(env, sourceUrl, opts = {}) {
  const form = new FormData();
  form.append("url", sourceUrl);
  if (opts.id) form.append("id", opts.id);
  if (opts.metadata) form.append("metadata", JSON.stringify(opts.metadata));
  form.append("requireSignedURLs", String(!!opts.requireSignedURLs));

  const r = await fetch(IMG_BASE(env), {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.CF_IMAGES_API_TOKEN}` },
    body: form,
    signal: AbortSignal.timeout(CF_IMAGES_TIMEOUT_MS),
  });
  const data = await r.json();
  if (!data.success) throw new Error(`CF Images upload failed: ${JSON.stringify(data.errors)}`);
  return data.result;
}

export function imageUrl(env, imageId, variant = "public") {
  const hash = env.CF_IMAGES_ACCOUNT_HASH;
  return `https://imagedelivery.net/${hash}/${imageId}/${variant}`;
}

// Cloudflare Image Resizing — useful for thumbnails delivered through the
// hosted-page domain. Requires Image Resizing enabled on the zone.
export function resizedUrl(baseUrl, opts = {}) {
  const { width, height, fit = "cover", format = "auto", quality = 85 } = opts;
  const parts = [];
  if (width) parts.push(`width=${width}`);
  if (height) parts.push(`height=${height}`);
  parts.push(`fit=${fit}`, `format=${format}`, `quality=${quality}`);
  return `/cdn-cgi/image/${parts.join(",")}/${baseUrl.replace(/^https?:\/\//, "")}`;
}
