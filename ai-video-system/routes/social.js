// Manual social distribution trigger.
//
// POST /v1/social/publish { job_id }
//
// Refuses non-social jobs at the runner layer, but we still gate here.

import { json, error, readJson } from "../lib/util.js";
import { runSocialDistribution } from "../lib/social.js";
import { getVideoJob } from "../lib/supabase.js";

export default async function socialRoute(request, env, ctx, url) {
  if (request.method !== "POST") return error(405, "method_not_allowed");
  const path = url.pathname.replace(/^\/v1\/social/, "") || "/";
  if (path !== "/publish") return error(404, "not_found");

  const { body } = await readJson(request);
  if (!body?.job_id) return error(400, "missing_job_id");

  const job = await getVideoJob(env, body.job_id);
  if (!job) return error(404, "job_not_found");
  if (job.distribution !== "social") {
    return error(400, "not_a_social_job", "Personal/private videos may not be published to social.");
  }

  const result = await runSocialDistribution(env, body.job_id);
  return json(result);
}
