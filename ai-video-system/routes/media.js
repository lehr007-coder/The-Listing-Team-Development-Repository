// Public R2 passthrough for raw MP4 / GIF / JPG assets.
//
//   GET /media/v/<key>   → MP4 from VIDEO_BUCKET
//   GET /media/p/<key>   → JPG/GIF from PREVIEW_BUCKET
//
// Used by social platforms that need a direct media URL and by GHL email
// templates that embed the GIF preview.

import { error } from "../lib/util.js";

export default async function mediaRoute(request, env, ctx, url) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return error(405, "method_not_allowed");
  }
  const parts = url.pathname.split("/").filter(Boolean); // ["media","v|p", ...key]
  if (parts.length < 3 || parts[0] !== "media") return error(404, "not_found");

  const kind = parts[1];
  const key = parts.slice(2).join("/");
  const bucket = kind === "v" ? env.VIDEO_BUCKET : kind === "p" ? env.PREVIEW_BUCKET : null;
  if (!bucket) return error(404, "not_found");

  const obj = await bucket.get(key);
  if (!obj) return error(404, "not_found");

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("X-Robots-Tag", "noindex");
  if (request.method === "HEAD") return new Response(null, { headers });
  return new Response(obj.body, { headers });
}
