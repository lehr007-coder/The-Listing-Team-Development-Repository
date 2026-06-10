# tos-proxy — vendored worker bundle with go-live fixes

`worker.js` is the deployed code of the `tos-proxy-staging` Cloudflare Worker
(`https://tos-proxy-staging.lehr007.workers.dev`), extracted unmodified from
Cloudflare (version deployed 2026-06-10 02:56 UTC) and then patched with the
go-live fixes from the 2026-06-10 handoff. It is esbuild output of the
TypeScript source that lives in the local workspace at
`/Users/Scott/Documents/Claude/Projects/Listing Team Transaction Operating System/proxy/src/`
— that workspace remains the source of truth.

## ⚠️ Port these fixes to the TypeScript source

If you deploy from the local TS workspace without porting the fixes below,
they will be reverted. The fix commit on this file is intentionally separate
from the vendor commit so `git show` gives you the exact diff to port.

## Fixes applied (handoff items 2–5)

| Item | Source file (TS workspace) | Fix |
|---|---|---|
| 2 | `proxy/src/tos/intake-handlers.ts` (`createDocumentPacket`) | Removed invented packet keys `tos_doc_uploaded_at`, `tos_doc_file_ref`, `tos_doc_parser_status` (not in `PACKET_FIELDS`; GHL 400s). Packet now writes only `label` + `docType: "contract"` (lowercase, matching the working inline-base64 path). |
| 3 | `proxy/src/tos/parser-handlers.ts` (dedup snapshot) | Replaced the two `records/search` calls (`pageLimit: 100`, empty query — search-all, filter client-side) with parallel per-ID GETs, so dedup stays exact past 100 records per object. The existing `parser.dedup.snapshot` structured log already reports set sizes. |
| 4 | `proxy/src/tos/parser-handlers.ts` (`handleParserExtract`) | KV-backed lock `parse-lock:{transactionId}` (TTL 120s) on the `TOS_KV` binding. A concurrent parse of the same transaction gets `409 { error: "parse already in progress for this transaction", retryAfter: 120 }`. Body moved to inner `runParserExtract(body, env)`; lock released in `finally`. Skips locking gracefully if `TOS_KV` is unbound. |
| 5 | `proxy/src/tos/parser-handlers.ts` (parse-failure return) | Parse-failure-with-stored-packet now returns **200** (body already carries `ok: false, parseError, storedPacketId, hint`) so the UI recovery flow triggers. |

Item 1c (removal of the `KNOWN_GOOD_ROLES` role-fallback band-aid) needed no
change here: the deployed bundle never contained the band-aid — the deployed
party-create is already the direct create. The band-aid exists only in the
local TS workspace; remove it there per the handoff.

## Deploying

Deploy from a machine with wrangler credentials, using the **existing**
`wrangler.staging.toml` from the local workspace (it carries the `TOS_KV`
binding and vars). Do **not** deploy with a fresh config that omits the
worker's bindings — wrangler replaces the binding set on deploy and would
detach `TOS_KV`. No wrangler config is committed here for that reason.

## Verification after deploy (from the handoff)

1. Role probe (after the 11 pick-list values are added in GHL → Custom
   Objects → `tos_party` → `tos_party_role`): POST each role to
   `/tos/admin/parties/create` on the test deal — every role must return a
   `partyId`, then bulk-delete the probes.
2. Upload a real contract via the deal-detail "📤 Upload & Parse" button:
   docs count +1, deadlines + parties populated, no duplicates.
3. Click Re-parse twice quickly: the second call must return
   `409 "parse already in progress"`.
