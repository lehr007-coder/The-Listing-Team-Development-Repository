# Rollout order — AI Video Sidecar

> Each phase is independently shippable. Do not skip ahead.

## Phase 0 — Infra dry run (no GHL impact)

1. Merge this PR to `main` after review.
2. CI deploys `ai-video-system-staging`.
3. Create staging R2 buckets, KV namespace, queue. Update IDs in
   `wrangler.staging.toml`.
4. Apply `migrations/001_video_jobs.sql` to the ylopo-intelligence Supabase
   project.
5. Smoke `/v1/health` — every binding + upstream should be `true` after
   secrets are set.

## Phase 1 — Agent Studio + secrets

1. Create the four agents from `agents/*.md` in GHL Agent Studio.
2. Save their publish URLs → set `AGENT_*_URL` secrets on staging worker.
   (Or set `AGENT_FALLBACK_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` for
   the first sprint.)
3. Set HeyGen + FCPXML MCP secrets on staging.
4. Run a single `/v1/heygen/render` against a synthetic test contact.
   Confirm video lands in R2 + Stream and `video_jobs` reaches `delivered`.

## Phase 2 — Custom fields + private HEYGEN workflow

1. Run the field-collision pre-flight (`migrations/002_ghl_custom_fields.md`).
2. Create only the missing fields. **Stop and ask** before changing any
   pre-existing field types.
3. Create GHL workflow `AI VIDEO — HEYGEN` (see WORKFLOWS.md). Trigger
   only on `lead_priority_label = HOT` to start (smallest blast radius).
4. Run for **one** real lead → manually verify SMS/email content + GHL
   custom-field updates.
5. Expand triggers (FSBO, showings, valuation) one at a time, with a
   24-hour soak between each.

## Phase 3 — Hosted page / domains

1. Bind `videos.reallistingteam.com` and `media.reallistingteam.com`
   custom domains to the staging worker first; verify hosted pages and
   GIF/MP4 passthrough.
2. Cut over to the production worker once Phase 2 is stable.

## Phase 4 — FCPXML cinematic pipeline (social only)

1. Create FCPXML `AI VIDEO — FCPXML` workflow gated on
   `worthy_of_social = true`.
2. Manually flip `worthy_of_social=true` on **one** test listing →
   verify SOCIAL_*_WEBHOOK receives a payload.
3. Wire the webhook(s) to the existing GHL Social Planner / Buffer / Make.
4. Soak for 1 week with manual approval before each post.
5. Switch to auto-post once 10 manual approvals pass.

## Phase 5 — Analytics + scoring loop

1. Confirm `/v1/analytics/{open,click,event}` rows are appearing.
2. Confirm `scoring_log` rows with `source='ai_video'` show up alongside
   existing scoring rows.
3. Optional: extend the proxy worker's lead-scoring engine to weight
   `ai_video` events differently. **Out of scope for this PR.**

## Phase 6 — Production hardening

1. Add a daily KV-counter cap on render volume per location (cost guard).
2. Add Cloudflare R2 lifecycle rule: delete `video/*.mp4` > 90 days.
3. Wire the production deploy job in `.github/workflows/deploy-production.yml`.
4. Document re-render / hard-reset playbooks in `docs/OPS.md`.

## Kill switch

If anything looks wrong in production:

```sh
cd ai-video-system
npx wrangler@latest delete --name ai-video-system   # nukes the worker
```

The existing proxy / Ylopo / scoring stack continues running. The only
side-effect is that triggered video workflows return 5xx on their webhook
step (which the existing workflows treat as soft-fail).
