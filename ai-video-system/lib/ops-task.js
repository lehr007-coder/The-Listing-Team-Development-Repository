// Operator task runner, triggered by a KV flag instead of an API key.
//
// Why this exists: the migration and the credential smoke-tests live behind
// /v1/admin/*, which requires PROXY_API_KEY. Some operators (and automation)
// can deploy and write KV via Cloudflare OAuth but deliberately do not hold
// that key. Writing the flag to KV is an authenticated Cloudflare action, so
// it is an equivalent trust boundary without the secret changing hands.
//
// Contract:
//   set   VIDEO_KV["ops:task"] = "backfill" | "diagnostics" | "backfill,diagnostics"
//   next  every-minute cron picks it up, DELETES the flag first, then runs
//   read  VIDEO_KV["ops:result"] for the JSON result (7-day TTL)
//
// The flag is deleted BEFORE the work starts, so a task that times out or
// throws cannot loop forever on the next tick. Re-running is a deliberate
// second write of the flag. Both tasks are individually idempotent anyway.

import { migrateSupabaseToD1 } from "./migrate-d1.js";

const FLAG_KEY = "ops:task";
const RESULT_KEY = "ops:result";
const RESULT_TTL_S = 7 * 24 * 60 * 60;

async function streamTokenCheck(env) {
  if (!env.CF_ACCOUNT_ID) return { ok: false, reason: "CF_ACCOUNT_ID not set" };
  if (!env.CF_STREAM_API_TOKEN) return { ok: false, reason: "CF_STREAM_API_TOKEN not set" };
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/stream?limit=1`,
    { headers: { Authorization: `Bearer ${env.CF_STREAM_API_TOKEN}` },
      signal: AbortSignal.timeout(20_000) }
  );
  const data = await r.json().catch(() => null);
  return {
    ok: r.ok && data?.success === true,
    status: r.status,
    cf_errors: data?.errors ?? null,
    // Never echo the token. Only whether Cloudflare accepted it.
    hint: r.ok && data?.success
      ? "Stream token valid."
      : "Stream token invalid or lacks Stream:Edit scope.",
  };
}

async function imagesTokenCheck(env) {
  if (!env.CF_ACCOUNT_ID) return { ok: false, reason: "CF_ACCOUNT_ID not set" };
  if (!env.CF_IMAGES_API_TOKEN) return { ok: false, reason: "CF_IMAGES_API_TOKEN not set" };
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/images/v1?per_page=1`,
    { headers: { Authorization: `Bearer ${env.CF_IMAGES_API_TOKEN}` },
      signal: AbortSignal.timeout(20_000) }
  );
  const data = await r.json().catch(() => null);
  return {
    ok: r.ok && data?.success === true,
    status: r.status,
    cf_errors: data?.errors ?? null,
  };
}

async function diagnostics(env) {
  const [stream, images] = await Promise.all([
    streamTokenCheck(env).catch((e) => ({ ok: false, error: String(e?.message || e) })),
    imagesTokenCheck(env).catch((e) => ({ ok: false, error: String(e?.message || e) })),
  ]);
  return {
    env: env.ENVIRONMENT,
    // Presence only — never the values.
    config_present: {
      SUPABASE_URL: !!env.SUPABASE_URL,
      SUPABASE_KEY: !!env.SUPABASE_KEY,
      VIDEO_DB: !!env.VIDEO_DB,
      FCPXML_MCP_URL: !!env.FCPXML_MCP_URL,
      FCPXML_MCP_API_KEY: !!env.FCPXML_MCP_API_KEY,
      HEYGEN_API_KEY: !!env.HEYGEN_API_KEY,
      GHL_V2_TOKEN: !!env.GHL_V2_TOKEN,
      PROXY_API_KEY: !!env.PROXY_API_KEY,
    },
    cf_stream_token: stream,
    cf_images_token: images,
  };
}

export async function runPendingOpsTask(env) {
  if (!env.VIDEO_KV) return null;
  const flag = await env.VIDEO_KV.get(FLAG_KEY);
  if (!flag) return null;

  // Clear first: a task that dies must not re-fire every minute forever.
  await env.VIDEO_KV.delete(FLAG_KEY);

  const tasks = flag.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
  const result = {
    requested: tasks,
    env: env.ENVIRONMENT,
    started_at: new Date().toISOString(),
  };

  for (const task of tasks) {
    try {
      if (task === "backfill") {
        result.backfill = await migrateSupabaseToD1(env, { dryRun: false });
      } else if (task === "backfill-dry") {
        result.backfill_dry = await migrateSupabaseToD1(env, { dryRun: true });
      } else if (task === "diagnostics") {
        result.diagnostics = await diagnostics(env);
      } else {
        result[task] = { ok: false, reason: "unknown_task" };
      }
    } catch (err) {
      result[task] = { ok: false, error: String(err?.message || err) };
    }
  }

  result.finished_at = new Date().toISOString();
  await env.VIDEO_KV.put(RESULT_KEY, JSON.stringify(result, null, 2), {
    expirationTtl: RESULT_TTL_S,
  });
  return result;
}
