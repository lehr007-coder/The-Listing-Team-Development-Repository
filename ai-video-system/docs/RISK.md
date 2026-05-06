# Risk Analysis — AI Video Sidecar

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|------------|--------|------------|
| R1 | Personal video accidentally posted publicly | Low | **Critical** | Two-layer guard: `runDelivery` refuses social jobs, `runSocial` refuses non-social jobs. UI/workflow choice cannot bypass this. |
| R2 | Sidecar writes to a non-owned GHL custom field | Low | High | `lib/ghl.js#OWNED_FIELDS` allowlist drops anything off-list before issuing the PUT. |
| R3 | HeyGen/FCPXML callback replay or spoof | Medium | High | HMAC verify (`HEYGEN_CALLBACK_SECRET`, `FCPXML_CALLBACK_SECRET`) + KV-based dedupe (`cb:<engine>:<id>:<event>`). |
| R4 | Sidecar 5xx breaks production lead flow | Low | Medium | Sidecar is fire-and-forget from existing workflows (Webhook step). The proxy never depends on it for routing/scoring. |
| R5 | Render-cost runaway (HeyGen/FCPXML) | Medium | High | Idempotency via `findActiveJobForContact`; per-contact + per-type dedupe; daily KV-counter cap can be added in a future PR (`VIDEO_KV: count:<date>`). |
| R6 | Hosted page leaks PII in URL | Low | Medium | jobId is a random 16-byte unguessable token; page sets `noindex,nofollow`; no PII in URL or page. |
| R7 | GIF/thumb URL exposes Stream UID | Low | Low | Stream UIDs are not secret; signed URLs available if needed (`requireSignedURLs`). |
| R8 | `scoring_log` injection skews lead score | Low | Medium | Sidecar only INSERTs `source='ai_video'` rows. Existing scoring engine can filter by source if it wants to exclude. |
| R9 | KV namespace fills | Low | Low | Dedupe keys carry `expirationTtl` (24h). |
| R10 | R2 cost from raw MP4 storage | Medium | Medium | Cloudflare Stream is the playback path — R2 keeps a single canonical copy. Lifecycle rule: delete > 90 days (set in CF dashboard, not code). |
| R11 | Social webhook rate-limit | Medium | Low | Per-platform retry on `msg.retry({delaySeconds})` from queue consumer (current consumer batches MP4 only; social retry would be a follow-up). |
| R12 | Agent Studio agent down | Medium | Low | Falls back to direct Anthropic/OpenAI call via `AGENT_FALLBACK_PROVIDER`. |
| R13 | Custom-field collision (someone else created `video_url` already) | Low | Medium | `migrations/002` includes a pre-flight check; DO NOT auto-create. |
| R14 | New worker shares the same Supabase project; row counts grow | Medium | Low | Indexes on `(contact_id)`, `(status)`, `(created_at desc)`. Add partition or separate project later if `video_events` exceeds ~10M rows. |
| R15 | Existing workflows accidentally rerouted to sidecar domain | Very Low | High | Sidecar uses dedicated subdomains (`videos.`, `media.`). The proxy/main worker domains are untouched. |
| R16 | Long-running queue handler hits Worker CPU limit | Low | Medium | Queue consumer kicks off Stream copy-from-url (Cloudflare-side ingest) — the worker doesn't stream bytes itself. |
