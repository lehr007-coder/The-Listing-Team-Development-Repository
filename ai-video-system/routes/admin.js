// Admin / debugging endpoints. All gated by PROXY_API_KEY (the route
// table marks /v1/admin as auth=true).
//
//   GET    /v1/admin/jobs?limit=50&contact_id=<>&status=<>
//   GET    /v1/admin/jobs/:id
//   GET    /v1/admin/jobs/:id/events
//   GET    /v1/admin/jobs/:id/diagnose    → why is this job stuck?
//   POST   /v1/admin/jobs/:id/fail        { "reason": "..." }
//   POST   /v1/admin/jobs/:id/reprocess   { "url": "<mp4 url>" }
//   GET    /v1/admin/health-deep            → /v1/health + active job counters
//   GET    /v1/admin/heygen/credits         → HeyGen API credit balance
//
//   GET    /v1/admin/kill                   → current kill-switch state
//   POST   /v1/admin/kill                   → activate kill-switch (paused)
//   DELETE /v1/admin/kill                   → clear kill-switch (resume)
//
//   GET    /v1/admin/rate-limits            → live KV counters vs caps
//   GET    /v1/admin/daily-summary?days=N   → 24h (or N-day) rollup
//   GET    /v1/admin/analytics/summary?days=N  → 30-day analytics rollup
//                                                with per-video-type breakdown
//                                                + daily series for charts
//   POST   /v1/admin/reports/weekly/send     → generate + email the weekly
//                                              report. Body: { dry_run?, days?,
//                                              recipients?:[contact_ids] }
//   GET    /v1/admin/alerts                  → operational health alerts:
//                                              credits, orphans, stuck jobs,
//                                              missing config, kill-switch
//   POST   /v1/admin/jobs/orphan-cleanup     → bulk-mark stale 'rendered' jobs
//                                              as 'failed'. Body: { dry_run?,
//                                              max_rows? } — defaults to dry-run.
//   POST   /v1/admin/contacts/sync-scores   → resync GHL video_engagement_score for
//                                              all contacts with delivered jobs. Body:
//                                              { dry_run?, max? } — defaults to dry_run.
//   GET    /v1/admin/contacts/lookup?email=X → resolve GHL contact_id by email.
//                                              Used to populate WEEKLY_REPORT_CONTACT_IDS.
//   GET    /v1/admin/contacts/top?limit=N   → leaderboard by engagement
//   GET    /v1/admin/contacts/:id/videos    → all videos for a contact
//
//   GET    /v1/admin/ghl/webhooks           → list GHL webhooks for this location
//   POST   /v1/admin/ghl/webhooks/register  → register the ContactTagUpdate webhook (idempotent)
//   POST   /v1/admin/ghl/webhooks/setup     → PUT existing webhook by ID with correct URL+events
//
//   POST   /v1/admin/agents/test            → invoke an agent with a sample
//                                             context; NO HeyGen credit spent.
