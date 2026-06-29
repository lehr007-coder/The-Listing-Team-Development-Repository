// Shared analytics helpers. Single source of truth for the rollup shape
// surfaced via /v1/admin/analytics/summary (dashboard) and the weekly
// report email. Both call summarizeJobs(env, days) so the dashboard
// and the email always show the same numbers for the same window.
//
// avg_engagement fix:
//   The earlier shape divided total_engagement (summed across ALL
//   statuses) by `delivered`, which inflated the per-type average for
//   any type with engagement on rendering/failed jobs. We now compute
//   `delivered_engagement` separately so avg_engagement = delivered
//   engagement / delivered count.

function sbHeaders(env) {
  const key = env.SUPABASE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    "apikey": key,
    "Authorization": `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

// Build day buckets from since to today using a calendar-walk so the
// partial first day of the rolling window is included. Earlier shape
// floored each day via `now - i*24h` which dropped the partial first
// day's jobs from the chart while still counting them in totals.
function buildDayBuckets(since) {
  const byDay = {};
  const earliestDay = since.slice(0, 10);
  const todayUtc = new Date().toISOString().slice(0, 10);
  let cursor = earliestDay;
  while (cursor <= todayUtc) {
    byDay[cursor] = { day: cursor, rendered: 0, delivered: 0, failed: 0 };
    cursor = new Date(new Date(cursor + "T00:00:00Z").getTime() + 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);
  }
  return byDay;
}

export async function summarizeJobs(env, days) {
  const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const since = new Date(sinceMs).toISOString();

  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/video_jobs` +
    `?created_at=gte.${encodeURIComponent(since)}` +
    `&select=id,status,render_engine,video_type,engagement_score,created_at,delivered_at` +
    `&limit=5000`,
    { headers: sbHeaders(env) }
  );
  if (!r.ok) throw new Error(`supabase summary fetch failed: ${r.status} ${await r.text()}`);
  const jobs = await r.json();

  const byDay = buildDayBuckets(since);
  for (const j of jobs) {
    const d = (j.created_at || "").slice(0, 10);
    if (!byDay[d]) continue;
    byDay[d].rendered++;
    if (j.status === "delivered") byDay[d].delivered++;
    if (j.status === "failed")    byDay[d].failed++;
  }
  const daily = Object.values(byDay).sort((a, b) => a.day.localeCompare(b.day));

  const byType = {};
  let totalEngagement = 0;
  let deliveredEngagement = 0;
  let totalDelivered = 0;
  let totalFailed = 0;
  for (const j of jobs) {
    const vt = j.video_type || "unknown";
    const t = byType[vt] = byType[vt] || {
      video_type: vt,
      total: 0,
      delivered: 0,
      failed: 0,
      rendering: 0,
      total_engagement: 0,
      delivered_engagement: 0,
    };
    const eng = j.engagement_score || 0;
    t.total++;
    t.total_engagement += eng;
    totalEngagement += eng;
    if (j.status === "delivered") {
      t.delivered++;
      t.delivered_engagement += eng;
      totalDelivered++;
      deliveredEngagement += eng;
    }
    if (j.status === "failed")    { t.failed++;    totalFailed++; }
    if (j.status === "rendering") t.rendering++;
  }
  const byTypeArr = Object.values(byType).map(t => ({
    ...t,
    delivery_rate_pct: t.total > 0 ? +(t.delivered / t.total * 100).toFixed(1) : null,
    // avg_engagement = engagement from delivered jobs only, divided by
    // delivered count — answers "how much engagement do recipients of
    // this video type generate on average?" The earlier shape divided
    // engagement across ALL statuses by delivered, which inflated the
    // metric for types with engagement on rendering/failed rows.
    avg_engagement: t.delivered > 0
      ? +(t.delivered_engagement / t.delivered).toFixed(1)
      : null,
  })).sort((a, b) => b.total - a.total);

  return {
    window: { days, since, until: new Date().toISOString() },
    totals: {
      jobs: jobs.length,
      delivered: totalDelivered,
      failed: totalFailed,
      delivery_rate_pct: jobs.length > 0
        ? +(totalDelivered / jobs.length * 100).toFixed(1)
        : null,
      total_engagement: totalEngagement,
      delivered_engagement: deliveredEngagement,
    },
    daily,
    by_video_type: byTypeArr,
  };
}
