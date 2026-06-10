**Generated:** 2026-06-10 22:04 UTC

# TOS go-live handoff — status: BLOCKED (environment mismatch)

The five go-live items in the handoff target TypeScript source at
`proxy/src/tos/` inside the workspace
`/Users/Scott/Documents/Claude/Projects/Listing Team Transaction Operating System/`
on Scott's Mac. That source does **not** exist in this GitHub repository
(`lehr007-coder/the-listing-team-development-repository`) — not in the working
tree, not in any branch, not anywhere in git history. The only worker code
checked in here is `thelistingteamproxy/worker.js` (the main CRM proxy, a
different worker that merely embeds the TOS dashboard UI).

This cloud session therefore cannot make the code changes as written. It also
cannot run the verification curls (the environment's network policy blocks
outbound requests to `tos-proxy-staging.lehr007.workers.dev` — "Host not in
allowlist") and cannot deploy (no wrangler credentials in this environment; the
Cloudflare MCP integration is read-only for Workers).

## What WAS verified — against the live deployed worker

The deployed code of `tos-proxy-staging` (last modified 2026-06-10 02:56 UTC)
was retrieved read-only via the Cloudflare integration and inspected. The
bundle is unminified, so identifiers survive; comments do not. Findings per
item:

### Item 1 (role pick-list + band-aid removal)
- The 1b role probe could not be run from this environment (network policy).
  Unknown whether the 11 pick-list values have been added in GHL yet.
- **Deviation worth knowing:** the deployed `handleAdminPartyCreate` contains
  **no** `KNOWN_GOOD_ROLES` / `fallbackRoleFor` band-aid. The deployed handler
  is already the direct create that Item 1c asks to restore
  (`tos_party_name` / `tos_party_role` set straight from the request body,
  then `createRecord`). The band-aid described in the handoff exists only in
  the local workspace and was never deployed — so on the live worker, unknown
  roles will 400 until the GHL pick-list is expanded (Item 1a), and Item 1c is
  a local-workspace-only edit.

### Item 2 (invented packet field keys) — CONFIRMED LIVE
The deployed `createDocumentPacket` (URL-based intake path) writes all three
invented keys:

```js
async function createDocumentPacket(client, env2, fileUrl) {
  return createRecord(client, env2, OBJECT_KEYS.documentPacket, {
    [PACKET_FIELDS.label]: "Inbound Contract",
    [PACKET_FIELDS.docType]: "Contract",
    "tos_doc_uploaded_at": new Date().toISOString(),
    "tos_doc_file_ref": fileUrl,
    "tos_doc_parser_status": "Pending"
  });
}
```

URL-based intake is broken in production exactly as described.

### Item 3 (dedup search-all query) — CONFIRMED LIVE
The deployed dedup snapshot searches deadlines and parties with
`{ locationId, page: 1, pageLimit: 100, query: "" }` and then filters
client-side with `deadlineIds.includes(r.id)` / `partyIds.includes(r.id)`.
Dedup will silently degrade once the location exceeds 100 records per object,
as described.

### Item 4 (parse concurrency lock) — CONFIRMED ABSENT
No `parse-lock` (or any KV-backed lock) exists anywhere in the deployed
bundle. Concurrent parses of the same transaction will duplicate records, as
described.

### Item 5 (500 instead of 200 on parse-failure-with-stored-packet) — CONFIRMED LIVE
The deployed parse-failure return sends the correct body
(`ok: false, parseError, storedPacketId, hint`) but with status `500`:

```js
return json2({
  ok: false,
  parseError: msg,
  transactionId: body.transactionId,
  storedPacketId,
  hint: storedPacketId ? "Contract was saved (...)" : "Contract was NOT saved (...)"
}, 500);
```

## Conclusion

The handoff's diagnosis is accurate for items 2, 3, 4, and 5 — all four bugs
are confirmed in the live worker. Item 1c is already moot in the deployed
code but presumably still pending in the local workspace.

## To unblock, one of:

1. **Push the TOS proxy source to this repository** (e.g. `proxy/` at repo
   root, from the local workspace clone). A cloud session can then make the
   four code fixes exactly as the handoff specifies. Deploy and live curls
   would still need to run from a machine with wrangler credentials and
   network access, or the environment's network policy / secrets would need
   to include them.
2. **Run the handoff prompt locally** on the Mac that has the workspace —
   the handoff was written for that environment and everything in it works
   there as-is.
3. **(Fallback, not recommended)** Vendor the deployed bundle into this repo
   and patch it directly — this repo already uses the checked-in-bundle
   pattern for `thelistingteamproxy/worker.js`, but it would fork the TOS
   worker away from its TypeScript source of truth.

No code was changed and nothing was deployed in this session. The only file
added is this report.
