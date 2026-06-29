// Health-alerts aggregator. Surfaces known-bad operational states so the
// dashboard can show them prominently and ops can react before they
// impact users.
//
// Each alert: { severity: "info"|"warn"|"error", kind, message,
//               count?, action?: { method, path, body? }, ids?: [] }
//
// severity drives UI color in the dashboard:
//   info  — informational, no action required
//   warn  — investigate today
//   error — something is broken right now

import { getCreditBalance } from "./heygen.js";

function sbHeaders(env) {
  const key = env.SUPABASE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    "apikey": key,
    "Authorization": `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

const ORPHAN_RENDERED_MIN_AGE_HOURS = 1;     // safety margin past delivery timeout
const HEYGEN_LOW_CREDIT_THRESHOLD = 20;       // warn below this
const STUCK_RENDERING_MIN_AGE_MIN = 10;      // poll-fallback should catch within minutes

// One Supabase query covers stuck-rendering + orphaned-rendered. We
// select only id + created_at + status to keep the row size tight.
async function fetchStuckJobs(env) {
  if (!env.SUPABASE_URL || !(env.SUPABASE_KEY || env.SUPABASE_SERVICE_ROLE_KEY)) {
    return { stuckRendering: [], orphans: [], skipped: "no_supabase" };
  }
  const cutoffRendering = new Date(Date.now() - STUCK_RENDERING_MIN_AGE_MIN * 60 * 1000).toISOString();
  const cutoffOrphan    = new Date(Date.now() - ORPHAN_RENDERED_MIN_AGE_HOURS * 60 * 60 * 1000).toISOString();

  const url = `${env.SUPABASE_URL}/rest/v1/video_jobs` +
    `?status=in.(rendering,rendered)` +
    `&created_at=lt.${encodeURIComponent(cutoffRendering)}` +
    `&select=id,status,created_at,rendered_at,delivered_at,video_type,heygen_video_id` +
    `&order=created_at.asc&limit=200`;

  const r = await fetch(url, { headers: sbHeaders(env) });
  if (!r.ok) {
    return { stuckRendering: [], orphans: [], error: `supabase ${r.status}` };
  }
  const rows = await r.json();
  const stuckRendering = rows.filter(j => j.status === "rendering");
  const orphans = rows.filter(j => j.status === "rendered" && j.created_at < cutoffOrphan);
  return { stuckRendering, orphans };
}

export async function gatherAlerts(env) {
  const alerts = [];
  const meta = { generated_at: new Date().toISOString() };

  // ── HeyGen credits ──
  try {
    const credits = await getCreditBalance(env);
    if (credits?.ok && credits.remaining_quota !== null) {
      meta.heygen_credits = credits.remaining_quota;
      if (credits.remaining_quota === 0) {
        alerts.push({
          severity: "error",
          kind: "heygen_credits_zero",
          message: "HeyGen credits are zero — every new render will fail until topped up.",
          action: { method: "OPEN_URL", path: "https://app.heygen.com/settings?nav=plan" },
        });
      } else if (credits.remaining_quota < HEYGEN_LOW_CREDIT_THRESHOLD) {
        alerts.push({
          severity: "warn",
          kind: "heygen_credits_low",
          message: `HeyGen credits low: ${credits.remaining_quota} remaining (warn threshold ${HEYGEN_LOW_CREDIT_THRESHOLD}).`,
          count: credits.remaining_quota,
          action: { method: "OPEN_URL", path: "https://app.heygen.com/settings?nav=plan" },
        });
      }
    } else if (credits && !credits.ok) {
      alerts.push({
        severity: "warn",
        kind: "heygen_credits_unreachable",
        message: `Could not query HeyGen credits: ${credits.error || "unknown"}`,
      });
    }
  } catch (e) {
    alerts.push({
      severity: "warn",
      kind: "heygen_credits_threw",
      message: `getCreditBalance threw: ${e.message}`,
    });
  }

  // ── Weekly report recipients configured? ──
  const recipientsCount = (env.WEEKLY_REPORT_CONTACT_IDS || "")
    .split(",").map(s => s.trim()).filter(Boolean).length;
  meta.weekly_report_recipients = recipientsCount;
  if (recipientsCount === 0) {
    alerts.push({
      severity: "info",
      kind: "weekly_report_not_configured",
      message: "No WEEKLY_REPORT_CONTACT_IDS set — Monday cron will skip every week until configured.",
      action: { method: "OPEN_URL", path: "https://dash.cloudflare.com/?to=/:account/workers/services/view/ai-video-system/production/settings" },
    });
  }

  // ── Stuck rendering + orphaned rendered jobs ──
  try {
    const { stuckRendering, orphans, error: jobsErr, skipped } = await fetchStuckJobs(env);
    if (jobsErr) {
      alerts.push({
        severity: "warn",
        kind: "supabase_unreachable",
        message: `Could not query video_jobs: ${jobsErr}`,
      });
    } else if (!skipped) {
      meta.stuck_rendering_count = stuckRendering.length;
      meta.orphan_rendered_count = orphans.length;
      if (stuckRendering.length > 0) {
        alerts.push({
          severity: "error",
          kind: "jobs_stuck_rendering",
          message: `${stuckRendering.length} job(s) stuck in 'rendering' for >${STUCK_RENDERING_MIN_AGE_MIN} min — poll-fallback should have caught these.`,
          count: stuckRendering.length,
          ids: stuckRendering.slice(0, 10).map(j => j.id),
          action: { method: "GET", path: `/v1/admin/jobs?status=rendering` },
        });
      }
      if (orphans.length > 0) {
        alerts.push({
          severity: "warn",
          kind: "jobs_orphaned_rendered",
          message: `${orphans.length} job(s) reached 'rendered' but never delivered (older than ${ORPHAN_RENDERED_MIN_AGE_HOURS}h) — cleanup via POST /v1/admin/jobs/orphan-cleanup.`,
          count: orphans.length,
          ids: orphans.slice(0, 10).map(j => j.id),
          action: { method: "POST", path: "/v1/admin/jobs/orphan-cleanup", body: { dry_run: true } },
        });
      }
    }
  } catch (e) {
    alerts.push({
      severity: "warn",
      kind: "jobs_query_threw",
      message: `fetchStuckJobs threw: ${e.message}`,
    });
  }

  // ── Kill-switch active? ──
  // killSwitchState lives in util.js but to avoid an import cycle the
  // dashboard already pulls /v1/admin/health-deep which surfaces this;
  // we surface it here too so the alerts panel is self-contained.
  if (env.VIDEO_KV) {
    try {
      const killed = await env.VIDEO_KV.get("kill_switch");
      if (killed) {
        alerts.push({
          severity: "warn",
          kind: "kill_switch_active",
          message: "Kill switch is ON — all new /v1/heygen/render submissions return 503.",
          action: { method: "DELETE", path: "/v1/admin/kill" },
        });
      }
    } catch (e) {
      // non-fatal
    }
  }

  return { alerts, meta };
}

// Mark stale 'rendered' jobs as 'failed' so they don't pollute analytics.
// dryRun returns the list without mutating. Returns { matched, ids,
// updated? } so the caller can preview before committing.
const ORPHAN_CLEANUP_MIN_AGE_HOURS = 6;       // longer cushion for the cleanup path
const ORPHAN_CLEANUP_MAX_AGE_HOURS = 24 * 30; // a month — anything older isn't recoverable

export async function cleanupOrphanedRendered(env, { dryRun = true, maxRows = 50 } = {}) {
  if (!env.SUPABASE_URL || !(env.SUPABASE_KEY || env.SUPABASE_SERVICE_ROLE_KEY)) {
    return { ok: false, reason: "no_supabase" };
  }
  const cutoffUpper = new Date(Date.now() - ORPHAN_CLEANUP_MIN_AGE_HOURS * 60 * 60 * 1000).toISOString();
  const cutoffLower = new Date(Date.now() - ORPHAN_CLEANUP_MAX_AGE_HOURS * 60 * 60 * 1000).toISOString();
  const cap = Math.min(maxRows, 200);

  const listUrl = `${env.SUPABASE_URL}/rest/v1/video_jobs` +
    `?status=eq.rendered` +
    `&created_at=lt.${encodeURIComponent(cutoffUpper)}` +
    `&created_at=gt.${encodeURIComponent(cutoffLower)}` +
    `&select=id,video_type,created_at,rendered_at,heygen_video_id` +
    `&order=created_at.asc&limit=${cap}`;
  const r = await fetch(listUrl, { headers: sbHeaders(env) });
  if (!r.ok) return { ok: false, reason: "list_failed", status: r.status, body: await r.text() };
  const rows = await r.json();

  if (rows.length === 0) {
    return { ok: true, matched: 0, ids: [], updated: 0 };
  }
  if (dryRun) {
    return { ok: true, dry_run: true, matched: rows.length, ids: rows.map(j => j.id), preview: rows };
  }

  // Bulk PATCH in chunks via the PostgREST `in` filter — was one request
  // per row (an N+1; up to 200 sequential round-trips). Chunked by 50 to
  // keep the id-list URL a sane length. Keep `status=eq.rendered` in the
  // filter so we only flip rows still orphaned, not ones a late delivery
  // rescued between our SELECT and now.
  const failedAt = new Date().toISOString();
  const errMsg = "marked failed by orphan-cleanup — rendered but delivery never fired";
  const CHUNK = 50;
  let updated = 0;
  const results = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK);
    const idList = batch.map(j => encodeURIComponent(j.id)).join(",");
    const patchUrl = `${env.SUPABASE_URL}/rest/v1/video_jobs?id=in.(${idList})&status=eq.rendered`;
    const pr = await fetch(patchUrl, {
      method: "PATCH",
      headers: { ...sbHeaders(env), "Prefer": "return=representation" },
      body: JSON.stringify({ status: "failed", error: errMsg, failed_at: failedAt }),
    });
    if (pr.ok) {
      const patched = await pr.json().catch(() => []);
      const okIds = new Set((Array.isArray(patched) ? patched : []).map(p => p.id));
      updated += okIds.size;
      for (const j of batch) results.push({ id: j.id, ok: okIds.has(j.id) });
    } else {
      for (const j of batch) results.push({ id: j.id, ok: false, status: pr.status });
    }
  }

  return {
    ok: updated > 0,
    matched: rows.length,
    updated,
    cutoff_upper: cutoffUpper,
    cutoff_lower: cutoffLower,
    results,
  };
}
