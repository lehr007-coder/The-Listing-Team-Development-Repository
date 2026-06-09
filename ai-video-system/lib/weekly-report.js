// Weekly performance report generator + sender.
//
// Pulls the same 7-day window the /v1/admin/analytics/summary?days=7
// endpoint returns, renders a branded HTML email, and sends one email
// per recipient contact via the existing GHL conversations path.
//
// Designed to fit comfortably inside Cloudflare's CPU budget:
//   • One Supabase query
//   • One HTML render (templated, no LLM call)
//   • Sequential GHL sends per recipient (capped at WEEKLY_REPORT_MAX_RECIPIENTS)
//
// Recipients are configured via env:
//   WEEKLY_REPORT_CONTACT_IDS = "<ghl_contact_id_1>,<ghl_contact_id_2>,..."
//
// Trigger paths:
//   • POST /v1/admin/reports/weekly/send  — manual / on-demand
//   • Cron (Monday 14:00 UTC) via worker.js scheduled handler
//
// Returns:
//   {
//     ok: true,
//     window: { since, until, days },
//     totals: { jobs, delivered, delivery_rate_pct, total_engagement },
//     by_video_type: [...],
//     recipients_attempted: N,
//     recipients_delivered: N,
//     results: [{ contact_id, ok, message_id?, error? }, ...]
//   }

import { sendEmail } from "./ghl.js";

const DEFAULT_DAYS = 7;
const MAX_RECIPIENTS = 20;

function sbHeaders(env) {
  const key = env.SUPABASE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    "apikey": key,
    "Authorization": `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

function fmtPct(n) {
  return n == null ? "—" : `${n}%`;
}

function fmtVideoType(t) {
  return String(t || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// Render the report HTML. Self-contained — inline styles so every
// email client (including Outlook desktop) shows it correctly.
function renderReportHtml(env, summary) {
  const totals = summary.totals || {};
  const byType = summary.by_video_type || [];
  const daily = summary.daily || [];
  const since = (summary.window?.since || "").slice(0, 10);
  const until = (summary.window?.until || "").slice(0, 10);

  // Sparkline rows. Outlook MSO won't render flex/grid reliably so we
  // use a sparkline-as-table where each column = one day.
  const maxDay = Math.max(1, ...daily.map(d => d.rendered || 0));
  const sparkRow = daily.map(d => {
    const h = Math.max(2, Math.round((d.rendered / maxDay) * 40));
    const c = d.failed > d.delivered ? "#e74c3c" : "#26c281";
    return `<td valign="bottom" style="padding:0 1px;width:${Math.floor(100/daily.length)}%">` +
      `<div style="background:${c};height:${h}px;border-radius:2px 2px 0 0" title="${d.day}: ${d.rendered} rendered"></div></td>`;
  }).join("");

  const dayLabels = daily.length
    ? `<tr><td style="font-size:10px;color:#888;padding:4px 0;text-align:left">${daily[0].day}</td>` +
      `<td colspan="${daily.length - 2}"></td>` +
      `<td style="font-size:10px;color:#888;padding:4px 0;text-align:right">${daily[daily.length-1].day}</td></tr>`
    : "";

  const typeRows = byType.map(t => {
    const pct = t.delivery_rate_pct;
    const pctColor = pct == null ? "#888" : (pct >= 80 ? "#26c281" : pct >= 50 ? "#f5a623" : "#e74c3c");
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${fmtVideoType(t.video_type)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${t.total}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;color:#26c281">${t.delivered}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;color:#e74c3c">${t.failed}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:600;color:${pctColor}">${fmtPct(pct)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${t.avg_engagement ?? "—"}</td>
    </tr>`;
  }).join("");

  const dashUrl = `${env.BASE_URL}/admin`;

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>AI Video — Weekly Report</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif;color:#222">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06)">
        <tr><td style="padding:24px 32px;background:#0a0a0a;color:#fff">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#ff6a00;font-weight:600">AI Video System</div>
          <div style="font-size:22px;font-weight:700;margin-top:6px">Weekly Performance Report</div>
          <div style="font-size:13px;color:#aaa;margin-top:4px">${since} → ${until}</div>
        </td></tr>

        <tr><td style="padding:20px 32px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="25%" style="padding:14px 8px;text-align:center;background:#fafafa;border-radius:6px">
                <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.08em">Jobs</div>
                <div style="font-size:24px;font-weight:700;margin-top:4px">${totals.jobs ?? 0}</div>
              </td>
              <td width="2%"></td>
              <td width="25%" style="padding:14px 8px;text-align:center;background:#fafafa;border-radius:6px">
                <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.08em">Delivered</div>
                <div style="font-size:24px;font-weight:700;color:#26c281;margin-top:4px">${totals.delivered ?? 0}</div>
              </td>
              <td width="2%"></td>
              <td width="25%" style="padding:14px 8px;text-align:center;background:#fafafa;border-radius:6px">
                <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.08em">Delivery rate</div>
                <div style="font-size:24px;font-weight:700;margin-top:4px">${fmtPct(totals.delivery_rate_pct)}</div>
              </td>
              <td width="2%"></td>
              <td width="25%" style="padding:14px 8px;text-align:center;background:#fafafa;border-radius:6px">
                <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.08em">Engagement</div>
                <div style="font-size:24px;font-weight:700;margin-top:4px">${totals.total_engagement ?? 0}</div>
              </td>
            </tr>
          </table>
        </td></tr>

        <tr><td style="padding:8px 32px 24px">
          <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Daily activity</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="height:50px"><tr>${sparkRow}</tr>${dayLabels}</table>
        </td></tr>

        ${byType.length ? `<tr><td style="padding:8px 32px 24px">
          <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">By video type</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;border-collapse:collapse">
            <thead><tr style="background:#fafafa">
              <th style="padding:8px 12px;text-align:left;font-weight:600;font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.06em">Type</th>
              <th style="padding:8px 12px;text-align:right;font-weight:600;font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.06em">Total</th>
              <th style="padding:8px 12px;text-align:right;font-weight:600;font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.06em">Delivered</th>
              <th style="padding:8px 12px;text-align:right;font-weight:600;font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.06em">Failed</th>
              <th style="padding:8px 12px;text-align:right;font-weight:600;font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.06em">Rate</th>
              <th style="padding:8px 12px;text-align:right;font-weight:600;font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.06em">Avg Eng.</th>
            </tr></thead>
            <tbody>${typeRows}</tbody>
          </table>
        </td></tr>` : ""}

        <tr><td style="padding:16px 32px 28px;text-align:center">
          <a href="${dashUrl}" style="display:inline-block;background:#ff6a00;color:#000;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;font-size:14px">Open Full Dashboard →</a>
        </td></tr>

        <tr><td style="padding:14px 32px 18px;background:#fafafa;border-top:1px solid #eee;font-size:11px;color:#888;text-align:center">
          This report is generated weekly from <code>/v1/admin/analytics/summary?days=${summary.window?.days ?? DEFAULT_DAYS}</code>.<br>
          Unsubscribe via your GHL contact preferences — managed at the location level.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// Build the summary in-process (same shape as /v1/admin/analytics/summary)
// so the report endpoint doesn't need a self-fetch — saves CPU + one round
// trip and means we get the same data the dashboard shows.
async function buildSummary(env, days) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/video_jobs` +
    `?created_at=gte.${encodeURIComponent(since)}` +
    `&select=id,status,render_engine,video_type,engagement_score,created_at,delivered_at` +
    `&limit=5000`,
    { headers: sbHeaders(env) }
  );
  if (!r.ok) throw new Error(`supabase summary fetch failed: ${r.status} ${await r.text()}`);
  const jobs = await r.json();

  const byDay = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    byDay[d] = { day: d, rendered: 0, delivered: 0, failed: 0 };
  }
  for (const j of jobs) {
    const d = (j.created_at || "").slice(0, 10);
    if (!byDay[d]) continue;
    byDay[d].rendered++;
    if (j.status === "delivered") byDay[d].delivered++;
    if (j.status === "failed")    byDay[d].failed++;
  }
  const daily = Object.values(byDay).sort((a, b) => a.day.localeCompare(b.day));

  const byType = {};
  let totalEngagement = 0, totalDelivered = 0, totalFailed = 0;
  for (const j of jobs) {
    const vt = j.video_type || "unknown";
    const t = byType[vt] = byType[vt] || {
      video_type: vt, total: 0, delivered: 0, failed: 0, rendering: 0, total_engagement: 0,
    };
    t.total++;
    if (j.status === "delivered") { t.delivered++; totalDelivered++; }
    if (j.status === "failed")    { t.failed++;    totalFailed++; }
    if (j.status === "rendering") t.rendering++;
    t.total_engagement += (j.engagement_score || 0);
    totalEngagement += (j.engagement_score || 0);
  }
  const byTypeArr = Object.values(byType).map(t => ({
    ...t,
    delivery_rate_pct: t.total > 0 ? +(t.delivered / t.total * 100).toFixed(1) : null,
    avg_engagement:    t.delivered > 0 ? +(t.total_engagement / t.delivered).toFixed(1) : null,
  })).sort((a, b) => b.total - a.total);

  return {
    window: { days, since, until: new Date().toISOString() },
    totals: {
      jobs: jobs.length,
      delivered: totalDelivered,
      failed: totalFailed,
      delivery_rate_pct: jobs.length > 0 ? +(totalDelivered / jobs.length * 100).toFixed(1) : null,
      total_engagement: totalEngagement,
    },
    daily,
    by_video_type: byTypeArr,
  };
}

function parseRecipients(env) {
  const raw = env.WEEKLY_REPORT_CONTACT_IDS || "";
  return raw.split(",").map(s => s.trim()).filter(Boolean).slice(0, MAX_RECIPIENTS);
}

// Main entrypoint. Used by both the manual endpoint and the cron path.
export async function generateAndSendWeeklyReport(env, { days, recipients, dryRun } = {}) {
  const reportDays = days ?? DEFAULT_DAYS;
  const summary = await buildSummary(env, reportDays);
  const subject = `AI Video Weekly Report — ${summary.totals.delivered} delivered, ${summary.totals.jobs} total`;
  const html = renderReportHtml(env, summary);

  const targets = recipients || parseRecipients(env);
  if (targets.length === 0) {
    return {
      ok: false,
      reason: "no_recipients",
      hint: "Set env WEEKLY_REPORT_CONTACT_IDS to a comma-separated list of GHL contact IDs.",
      summary,
    };
  }
  if (dryRun) {
    return { ok: true, dry_run: true, recipients: targets, subject, summary };
  }

  const hasGhlCreds = !!(env.GHL_V2_TOKEN || env.GHL_API_KEY);
  if (!hasGhlCreds) {
    return {
      ok: false,
      reason: "no_ghl_credentials",
      hint: "Set GHL_V2_TOKEN or GHL_API_KEY to enable sending.",
      summary,
    };
  }

  const results = [];
  for (const contactId of targets) {
    try {
      const r = await sendEmail(env, contactId, subject, html, null);
      results.push({ contact_id: contactId, ok: true, message_id: r?.messageId || r?.message_id || null });
    } catch (e) {
      results.push({ contact_id: contactId, ok: false, error: e.message });
    }
  }

  const delivered = results.filter(r => r.ok).length;
  return {
    ok: delivered > 0,
    window: summary.window,
    totals: summary.totals,
    by_video_type: summary.by_video_type,
    recipients_attempted: results.length,
    recipients_delivered: delivered,
    results,
  };
}
