// Manual / re-trigger delivery route. The queue consumer also calls runDelivery
// automatically once a render completes. This endpoint exists for re-sends
// and for cases where ops wants to trigger delivery without re-rendering.
//
// POST /v1/delivery/send  { job_id }

import { json, error, readJson } from "../lib/util.js";
import { runDelivery } from "../lib/delivery.js";

export default async function deliveryRoute(request, env, ctx, url) {
  if (request.method !== "POST") return error(405, "method_not_allowed");
  const path = url.pathname.replace(/^\/v1\/delivery/, "") || "/";
  if (path !== "/send") return error(404, "not_found");

  const { body } = await readJson(request);
  if (!body?.job_id) return error(400, "missing_job_id");

  const result = await runDelivery(env, body.job_id);
  return json(result);
}
