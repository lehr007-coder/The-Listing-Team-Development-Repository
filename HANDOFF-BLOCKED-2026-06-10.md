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

## Update (2026-06-10 22:30 UTC) — fixes applied to a vendored bundle

Scott approved proceeding. Since the TS source remains unavailable here, the
deployed bundle was vendored into this repo at `tos-proxy/worker.js` (pristine
vendor commit, then a separate fix commit so the diff is a clean port
reference) and the fixes for **items 2, 3, 4, and 5** were applied to it.
Item 1c needs no code change in the deployed line (band-aid never deployed).
See `tos-proxy/README.md` for the patch table, the warning about porting the
fixes back to the TS workspace, and deploy/verification steps.

Still outstanding (cannot be done from this session):

1. **Deploy** — no wrangler credentials here. Deploy from the Mac with the
   existing `wrangler.staging.toml` (it carries the `TOS_KV` binding), either
   from the patched TS source after porting, or pointing at this `worker.js`.
2. **Item 1a/1b** — add the 11 role pick-list values in the GHL UI, then run
   the role probe (network to the worker is blocked from this environment).
3. **Live verification curls** — upload-and-parse and double-Re-parse checks
   per the handoff, after deploy.
4. **Port items 2–5 to the TS workspace** and remove the Item 1c band-aid
   there, or the next local deploy reverts everything.
