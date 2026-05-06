# Testing checklist — AI Video Sidecar

## Unit-level smoke (manual via curl)

- [ ] `GET /v1/health` returns `ok:true` with all bindings + upstreams `true`.
- [ ] `POST /v1/heygen/render` with bad `video_type` → 400.
- [ ] `POST /v1/heygen/render` without `X-API-Key` → 401.
- [ ] `POST /v1/heygen/render` happy path → 200, `status:"rendering"`,
      and `video_jobs` row exists in Supabase.
- [ ] Repeated render for same contact + type → `deduped:true`.
- [ ] `POST /v1/fcpxml/render` happy path → 200.
- [ ] `POST /v1/heygen/callback` with valid HMAC + `success` → 200,
      MP4 ends up in R2, Stream UID set, GHL CFs updated.
- [ ] `POST /v1/heygen/callback` with bad HMAC → 401.
- [ ] `GET /v/<jobId>` renders the player page; refreshing fires an
      open event.
- [ ] `GET /v1/analytics/click?job=<id>&to=https://example.com` → 302
      and `video_events` row appended.
- [ ] `POST /v1/analytics/event { event:"watch_75" }` → row appended;
      `scoring_log` gets a `+8` row with `source='ai_video'`.

## Integration scenarios

### S1. Seller valuation (HEYGEN)
1. In a test contact, set `seller_estimated_value=742000`.
2. Workflow `AI VIDEO — HEYGEN` fires.
3. Within ~3 minutes (HeyGen render): SMS arrives with hosted link;
   email arrives with clickable GIF.
4. Open the link → player loads → open pixel hit → CTA click hit.
5. Verify `video_status=delivered`, `video_url`, `video_gif_url`,
   `video_last_sent` populated.

### S2. Luxury listing reel (FCPXML)
1. Set `worthy_of_social=true` on a listing-derived contact.
2. Workflow fires `AI VIDEO — FCPXML` with `distribution=social`.
3. After render: SOCIAL_*_WEBHOOK receives platform-specific copy +
   media URL. Verify `video_jobs.delivery_results` populated.

### S3. Isolation guard (CRITICAL)
1. Send `POST /v1/social/publish` with a `distribution=private` job →
   400 `not_a_social_job`.
2. Force-call `runDelivery()` against a `social` job → throws.
3. Set `worthy_of_social=true` and confirm the personal HEYGEN workflow
   does **not** fire (different trigger).

### S4. No collisions
1. Run `migrations/002_ghl_custom_fields.md` pre-flight script.
2. `comm -23 needed.txt existing.txt` returns the create list — no
   existing fields are renamed.
3. After deploy, query the proxy worker's `/dashboard` — confirm no
   regressions.

## Regression checks against existing systems

- [ ] Ylopo webhooks still hit thelistingteamproxy and write `events`
      rows as before.
- [ ] Existing lead-scoring totals stay correct (sidecar only **adds**
      rows to `scoring_log`).
- [ ] `pipeline_items` table not modified.
- [ ] No GHL workflow other than the two NEW sidecar workflows is
      altered.
