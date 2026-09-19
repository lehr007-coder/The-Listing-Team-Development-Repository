// Proactive health watch — the piece this system was missing.
//
// lib/alerts.js has known about low HeyGen credit since it was written, but
// gatherAlerts() is exposed ONLY at GET /v1/admin/alerts. It is pull-only.
// Nothing ever pushed it anywhere, so nobody found out until renders had
// already been failing for weeks. That is the mechanism behind "it keeps
// breaking": the signal existed and had no way out.
//
// This runs on the existing every-minute cron and pushes an email through the
// same GHL path the weekly report already uses. Two conditions, both drawn
// from real incidents in this system's history:
//
//   1. HeyGen credit. 93 of 301 render failures were explicitly credit
//      exhaustion and the 194 with no captured reason cluster in the same
//      month. Credit was measured at 3 on 2026-09-18.
//
//   2. Required config missing. A missing SUPABASE_URL took production down
//      silently for ~5 weeks — every call built `undefined/rest/v1/...` and
//      threw, and the newest job in the database was 5 weeks old when it was
//      finally noticed.
//
// Design rules, learned from the failures above:
//   - NEVER throw. This is called from the cron; a watch that breaks the
//     poll-fallback would be worse than no watch at all.
//   - Run the expensive part at most hourly, and email at most once per 24h
//     per condition, so an every-minute cron cannot spam or burn HeyGen API
//     calls.
//   - Only alert on a POSITIVELY READ bad value. An unreadable credit balance
//     is not zero; alerting on "unknown" trains people to ignore the alert.

import { getCreditBalance } from "./heygen.js";
import { sendEmail } from "./ghl.js";

const SWEEP_MARKER = "watch:last-sweep";
const SWEEP_INTERVAL_S = 60 * 60;          // do real work at most hourly
const ALERT_TTL_S = 24 * 60 * 60;          // one email per condition per day
const LOW_CREDIT_THRESHOLD = 20;

// Config whose absence has actually taken this Worker down. VIDEO_DB is a
// binding, the rest are secrets/vars.
const REQUIRED = ["SUPABASE_URL", "SUPABASE_KEY", "HEYGEN_API_KEY", "PROXY_API_KEY", "BASE_URL"];

function recipients(env) {
  return String(env.WEEKLY_REPORT_CONTACT_IDS || "")
    .split(",").map((s) => s.trim()).filter(Boolean).slice(0, 10);
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

async function alertOnce(env, kind, subject, lines) {
  const key = `watch:alerted:${kind}`;
  if (await env.VIDEO_KV.get(key)) return { kind, sent: false, reason: "already_alerted_today" };

  const to = recipients(env);
  if (!to.length) return { kind, sent: false, reason: "no_recipients" };
  if (!(env.GHL_V2_TOKEN || env.GHL_API_KEY)) return { kind, sent: false, reason: "no_ghl_credentials" };

  const html =
    `<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.5">` +
    `<p><strong>${esc(subject)}</strong></p><ul>` +
    lines.map((l) => `<li>${esc(l)}</li>`).join("") +
    `</ul><p style="color:#666;font-size:13px">ai-video-system (${esc(env.ENVIRONMENT || "unknown")}) · ` +
    `${esc(new Date().toISOString())}<br>This alert is sent at most once per 24 hours per condition.</p></div>`;

  let sent = 0;
  const errors = [];
  for (const contactId of to) {
    try {
      await sendEmail(env, contactId, subject, html, env.GHL_LOCATION_ID || null);
      sent++;
    } catch (err) {
      const msg = String(err?.message || err);
      errors.push(`${contactId}: ${msg}`);
      console.error(`health-watch: sendEmail to ${contactId} failed: ${msg}`);
    }
  }
  // Mark alerted even on partial success: retrying every minute is worse than
  // missing one recipient for a day.
  if (sent > 0) await env.VIDEO_KV.put(key, new Date().toISOString(), { expirationTtl: ALERT_TTL_S });
  return { kind, sent: sent > 0, recipients: sent, errors: errors.length ? errors : undefined };
}

export async function runHealthWatch(env) {
  try {
    if (!env.VIDEO_KV) return { skipped: "no_kv" };

    const last = await env.VIDEO_KV.get(SWEEP_MARKER);
    if (last) return { skipped: "swept_recently" };
    await env.VIDEO_KV.put(SWEEP_MARKER, new Date().toISOString(), { expirationTtl: SWEEP_INTERVAL_S });

    const out = { checked_at: new Date().toISOString(), alerts: [] };

    // 1. Required config. This is the 5-week-outage signature.
    const missing = REQUIRED.filter((k) => !env[k]);
    if (!env.VIDEO_DB) missing.push("VIDEO_DB (binding)");
    out.missing_config = missing;
    if (missing.length) {
      out.alerts.push(await alertOnce(env, "config-missing",
        `AI Video: required configuration is missing on ${env.ENVIRONMENT || "unknown"}`,
        [
          `Missing: ${missing.join(", ")}`,
          "This is the exact shape of the outage that ran silently for about five weeks: " +
          "calls build 'undefined/...' URLs and throw, so job creation, delivery, tracking " +
          "and the public /v/ pages all fail.",
          "Check with: GET https://videos.reallistingteam.com/v/healthcheck-probe — it must return 404. " +
          "A 500 mentioning 'Invalid URL' or 'undefined/' confirms it.",
        ]));
    }

    // 2. HeyGen credit. Only on a positively read balance.
    const credit = await getCreditBalance(env).catch((e) => ({ ok: false, error: String(e?.message || e) }));
    const quota = Number(credit?.remaining_quota);
    out.heygen_credit = credit?.ok ? quota : `unreadable (${credit?.error || "no response"})`;

    if (credit?.ok && Number.isFinite(quota)) {
      if (quota <= 0) {
        out.alerts.push(await alertOnce(env, "credit-zero",
          "AI Video: HeyGen credit is EXHAUSTED — no new videos can render",
          [
            `remaining_quota = ${quota}`,
            "New renders are now refused up front with 503 heygen_credit_exhausted, so no " +
            "further jobs will be created and fail. Nothing is queued or lost.",
            "Top up HeyGen to resume: https://app.heygen.com/settings?nav=plan",
          ]));
      } else if (quota <= LOW_CREDIT_THRESHOLD) {
        out.alerts.push(await alertOnce(env, "credit-low",
          `AI Video: HeyGen credit is low (${quota} remaining)`,
          [
            `remaining_quota = ${quota}, warning threshold is ${LOW_CREDIT_THRESHOLD}.`,
            "Credit exhaustion is the largest single cause of render failures in this " +
            "system's history. Topping up now avoids it.",
            "https://app.heygen.com/settings?nav=plan",
          ]));
      }
    }

    // Record the last conclusion so an operator can always see what the watch
    // decided and why, without tailing Worker logs. Also the only way to find
    // out that an alert was attempted but the send failed.
    try {
      await env.VIDEO_KV.put("watch:last-result", JSON.stringify(out, null, 2),
        { expirationTtl: 7 * 24 * 60 * 60 });
    } catch { /* recording is best-effort */ }

    return out;
  } catch (err) {
    // Never let the watch break the cron it rides on.
    console.error("health-watch failed (non-fatal):", err?.stack || err?.message || err);
    return { error: String(err?.message || err) };
  }
}
