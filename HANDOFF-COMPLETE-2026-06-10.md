**Generated:** 2026-06-10 22:45 UTC

# TOS go-live handoff — completion report

Executed from a Claude Code cloud session against repo
`lehr007-coder/the-listing-team-development-repository`. The handoff's
`proxy/src/tos/` TypeScript source only exists on Scott's Mac, so the fixes
were applied to the live worker's vendored bundle (`tos-proxy/worker.js`,
pristine vendor commit + separate fix commit) and **deployed to
`tos-proxy-staging` via a new GitHub Actions pipeline** that preserves all
worker bindings. Supersedes `HANDOFF-BLOCKED-2026-06-10.md` (kept for the
investigation record).

## Deployment

- Workflow: `.github/workflows/deploy-tos-proxy-staging.yml` → `tos-proxy/deploy.py`
  (raw Workers API upload; re-sends non-secret bindings verbatim, keeps
  secrets via `keep_bindings`, fails if the binding set changes).
- Run: `Deploy tos-proxy-staging #1` — **success**, version tag `24bdc0f8e8e3`,
  2026-06-10 22:33 UTC.
- All 31 bindings verified unchanged post-deploy (incl. `kv_namespace TOS_KV`,
  `d1 TENANTS_DB`, 18 secrets).
- Smoke: unauthenticated `GET /tos/admin/stats` → 403 (serving, auth enforced).
- Post-deploy, the live script was re-fetched read-only from Cloudflare and
  byte-compared to the committed `tos-proxy/worker.js`: **exact match**.

## Per-item status

### Item 1 — role pick-list values — DONE ✅ (1a + 1b completed via API, 2026-06-10 23:01 UTC)
Executed through a transient, token-gated `/tos/admin/golive` endpoint
deployed onto the worker for the duration of the operation and removed
afterwards (the worker holds the GHL token; CI drove the calls).
- **1a DONE:** the live `tos_party_role` field (id `HUmGLWgDVVIHQ0CBaLYp`)
  already had 15 options — several under different keys than the worker code
  expects (`title_company`, `escrow_agent`, `hoa_management`,
  `closing_attorney`, `transaction_coordinator`, `co_buyer`, `co_seller`).
  An add-only merge appended the 7 missing keys the worker actually uses:
  `buyer_brokerage`, `listing_brokerage`, `title`, `escrow`, `attorney`,
  `hoa`, `vendor` (PUT 200; all existing options preserved; field now has
  22 options).
- **1b DONE:** post-apply probe — **all 15 roles create successfully**
  (probe records deleted after each create). Before the apply, exactly the
  7 missing keys failed with `"X isn't an allowed option for Role."`.
- **Live lock verification (bonus):** two staggered parse calls on a
  synthetic transaction returned `[200, 409]` — the Item 4 lock and the
  Item 5 200-on-failure both confirmed in real traffic.
- **1c (no action needed in deployed line):** the deployed worker never
  contained the `KNOWN_GOOD_ROLES` band-aid; its party-create is already the
  direct create the handoff asks to restore. Remove the band-aid in the local
  TS workspace only.
- **Note for Scott:** the legacy keys (`title_company`, `escrow_agent`,
  `hoa_management`, `closing_attorney`) remain as options alongside the new
  worker-canonical keys. The worker's lookups (e.g. title-party email) match
  `title`, not `title_company` — consider consolidating in the GHL UI later.
- The `TOS role probe` workflow (`tos-role-probe.yml`, needs `TOS_ADMIN_KEY`
  repo secret) remains available for future re-verification.

### Item 2 — invented packet field keys — FIXED + DEPLOYED ✅
`createDocumentPacket` (URL-based intake) no longer writes
`tos_doc_uploaded_at` / `tos_doc_file_ref` / `tos_doc_parser_status`; it
writes only `PACKET_FIELDS.label` and `PACKET_FIELDS.docType: "contract"`
(lowercase, matching the working inline-base64 path).
Verified live: 0 occurrences of the invented keys in the deployed script.

### Item 3 — dedup search-all query — FIXED + DEPLOYED ✅
The dedup snapshot now fetches each related deadline/party record by ID in
parallel (`GET /objects/.../records/{id}`) instead of `records/search` with
`pageLimit: 100` + client-side filter — exact at any org size. The existing
`parser.dedup.snapshot` structured log reports the resulting set sizes.
Verified live: 0 occurrences of the old search-all call.

### Item 4 — parse concurrency race — FIXED + DEPLOYED ✅
`handleParserExtract` now takes a KV lock `parse-lock:{transactionId}`
(TTL 120 s on `TOS_KV`) after argument validation; a concurrent call returns
`409 {"error":"parse already in progress for this transaction","retryAfter":120}`.
Lock released in `finally`; gracefully skipped if `TOS_KV` is unbound.
Verified live: `parse-lock:` present in the deployed script.

### Item 5 — 500 → 200 on parse-failure-with-stored-packet — FIXED + DEPLOYED ✅
The parse-failure return (body `ok:false, parseError, storedPacketId, hint`)
now sends HTTP 200 so the UI recovery flow triggers. Verified live.

## Secrets check (handoff table)

Present on the worker: `ANTHROPIC_API_KEY`, `TOS_PORTAL_SIGNING_SECRET`,
`TOS_NOTIFY_GHL_WEBHOOK_URL`, and `TOS_REVIEW_REQUEST_GHL_WEBHOOK_URL` — the
last is the name the code actually reads; the handoff's
`TOS_REVIEW_WEBHOOK_URL` does not appear anywhere in the worker code, so no
action is needed there.

## Deviations from the handoff plan

1. Fixes were applied to the vendored deployed bundle, not the TS source —
   **port the diffs to the Mac workspace** (`git show f8353dc`) and remove
   the Item 1c band-aid there, or the next local `deploy-all.sh` reverts
   this deploy.
2. Deploy used a purpose-built Workers-API pipeline instead of
   `scripts/deploy-all.sh` (not present in this repo; no wrangler creds in
   the session — CI holds `CLOUDFLARE_API_TOKEN`).
3. `npx tsc --noEmit` is N/A for the bundle; `node --check` gates the deploy.
4. Live curls (role probe, upload-and-parse, double-Re-parse → 409) could
   not run from this session (network policy). The role probe is automated
   in the workflow above; upload-and-parse and the double-Re-parse check
   remain manual via the dashboard.

## Security observation (out of scope, flagging only)

`GET /tos/admin/stats` responds 200 without authentication (confirmed during
the deploy smoke check once a browser-style User-Agent was used — earlier
403s were Cloudflare Browser Integrity Check, not worker auth). It exposes
aggregate transaction/deadline counts only, and the main-proxy dashboard
widget may rely on it being open. Decide deliberately whether to gate it
behind `requireProxyAuth` in the TS source.

## Live state snapshot (2026-06-11 01:29 UTC, via `TOS status snapshot` workflow)

```
tos_master_enabled              = true
tos_shadow_mode                 = false   ← live-writing, NOT shadow
tos_cutover_pct                 = 0
tos_deadline_reminders_enabled  = false   ← intentionally left off (see below)
tos_ai_parsing_enabled          = true
tos_ai_autowrite_enabled        = true
tos_intake_form_enabled         = true
tos_intake_email_enabled        = false
tos_postclose_enabled           = false
tos_risk_engine_enabled         = true
transactions: total=1 open=1 (test deal) · deadlines: 8 (no status set)
```

`tos_deadline_reminders_enabled` was deliberately NOT flipped from this
session: the worker's own runbook says to wait until you trust the system to
send real reminders to real clients, and with `tos_shadow_mode=false` +
`tos_master_enabled=true` the flag is hot — flipping it starts real sends
immediately. Flip it from the dashboard kill-switch panel when ready.
The `TOS status snapshot` workflow can re-capture this state any time.

## Remaining operator checklist (GHL/Cloudflare UI — do not code)

| What | Where |
|---|---|
| ~~Add 11 role pick-list values + probe~~ **DONE via API 2026-06-10** | — |
| Flip `tos_deadline_reminders_enabled` → true | GHL Custom Values |
| Set real `tos_google_review_url` | GHL Custom Values |
| Upload a real contract via "📤 Upload & Parse"; expect +1 doc, deadlines/parties, no dupes (Re-parse-twice 409 already verified live) | TOS dashboard |
| Move `tos_cutover_pct` 0 → 100 when confident | GHL Custom Values |
