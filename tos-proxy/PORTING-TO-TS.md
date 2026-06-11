# Porting the deployed go-live fixes to the TypeScript workspace

**Target workspace:** `/Users/Scott/Documents/Claude/Projects/Listing Team Transaction Operating System/proxy/src/`
**Why:** the live `tos-proxy-staging` worker was patched and deployed from this
repo's `tos-proxy/worker.js` (bundle). The TS workspace on the Mac is still the
source of truth for `scripts/deploy-all.sh` — deploying from it without these
edits reverts the live fixes. The `TOS fix drift check` workflow in this repo
will fail and notify you if that ever happens.

**Fastest path:** open Claude Code in the workspace and paste the prompt at the
bottom of this file. Or apply the five edits by hand — each block below is the
exact end-state, byte-equivalent to what is live (decompiled names aside).

After all edits: `cd proxy && npx tsc --noEmit` must exit 0, then
`bash scripts/deploy-all.sh`. Then run the `TOS fix drift check` workflow in
GitHub Actions — it must pass, proving the redeploy kept the fixes.

---

## Edit 1 — `proxy/src/tos/admin-stats.ts` (handoff Item 1c)

In `handleAdminPartyCreate`, delete the role band-aid: the `KNOWN_GOOD_ROLES`
set, the `fallbackRoleFor` function, the `effectiveRole`/`effectiveName`
reassignment, and the catch-retry around `createRecord`. Restore the direct
create (this is already what runs in production — the band-aid was never
deployed):

```typescript
const partyProps: Record<string, unknown> = {
  tos_party_name: body.name,
  tos_party_role: body.role,
};
if (body.email) partyProps.tos_party_email = body.email.trim();
if (body.phone) {
  const normalized = normalizePhone(body.phone);
  if (normalized) partyProps.tos_party_phone = normalized;
}
const partyId = await createRecord(client, env, OBJECT_KEYS.party, partyProps);
```

The band-aid is obsolete because the GHL `tos_party_role` pick-list was
extended on 2026-06-10: all 11 handoff role keys now exist and all 15 roles
create successfully (verified by live probe).

## Edit 2 — `proxy/src/tos/intake-handlers.ts` (~line 118, handoff Item 2)

In `createDocumentPacket`, drop the three invented property keys
(`tos_doc_uploaded_at`, `tos_doc_file_ref`, `tos_doc_parser_status` — none
exist in `PACKET_FIELDS`; GHL 400s on them). Keep the existing function
signature; the properties object becomes exactly:

```typescript
{
  [PACKET_FIELDS.label]: "Inbound Contract",
  [PACKET_FIELDS.docType]: "contract",
}
```

Note `"contract"` is lowercase, matching the working inline-base64 path in
`document-storage.ts` (the old URL path had capitalized `"Contract"`).

## Edit 3 — `proxy/src/tos/parser-handlers.ts` (~lines 472–481, handoff Item 3)

In the dedup snapshot inside the parser-extract flow, replace the two
`records/search` calls (`pageLimit: 100`, empty `query`, client-side
`.includes(r.id)` filters) with exact per-ID GETs. The `deadlineIds`/`partyIds`
arrays from the `relRes` walk above stay as-is; the search block becomes:

```typescript
const [dlFetches, partyFetches] = await Promise.all([
  Promise.all(deadlineIds.map((id) =>
    client.request("GET", `/objects/${OBJECT_KEYS.deadline}/records/${encodeURIComponent(id)}`, undefined, undefined, VERSION_OBJECTS)
      .then((r) => (r.ok ? (r.json as { record?: GhlRecord }).record ?? null : null))
      .catch(() => null)
  )),
  Promise.all(partyIds.map((id) =>
    client.request("GET", `/objects/${OBJECT_KEYS.party}/records/${encodeURIComponent(id)}`, undefined, undefined, VERSION_OBJECTS)
      .then((r) => (r.ok ? (r.json as { record?: GhlRecord }).record ?? null : null))
      .catch(() => null)
  )),
]);
for (const r of dlFetches) {
  if (!r) continue;
  const dueDate = String(r.properties[DEADLINE_FIELDS.dueDate] ?? "");
  const type = normType(String(r.properties[DEADLINE_FIELDS.type] ?? ""));
  existingDeadlines.add(`${type}|${dueDate}`);
}
for (const r of partyFetches) {
  if (!r) continue;
  const role = String(r.properties["tos_party_role"] ?? "").toLowerCase().trim();
  const name = String(r.properties["tos_party_name"] ?? "").toLowerCase().trim();
  existingParties.add(`${role}|${name}`);
}
```

Use whatever the file's local name is for the `"2023-02-21"` objects-API
version constant, and the file's record type in place of `GhlRecord` (or
`any`). Keep the existing `structuredLog("parser.dedup.snapshot", ...)` line —
it already reports the set sizes.

## Edit 4 — `proxy/src/tos/parser-handlers.ts` (`handleParserExtract`, handoff Item 4)

Immediately after the three early-return argument validations (invalid JSON /
missing `transactionId` / missing file source), insert the KV lock and move the
rest of the original function body into a new `runParserExtract`:

```typescript
  const lockKey = `parse-lock:${body.transactionId}`;
  const LOCK_TTL = 120; // seconds — long enough for OCR + Claude + writes
  if (env.TOS_KV) {
    const existingLock = await env.TOS_KV.get(lockKey);
    if (existingLock) {
      return json({ ok: false, error: "parse already in progress for this transaction", retryAfter: LOCK_TTL }, 409);
    }
    await env.TOS_KV.put(lockKey, crypto.randomUUID(), { expirationTtl: LOCK_TTL });
  }
  try {
    return await runParserExtract(body, env);
  } finally {
    if (env.TOS_KV) {
      try {
        await env.TOS_KV.delete(lockKey);
      } catch {
        // best-effort release; the 120s TTL is the backstop
      }
    }
  }
}

async function runParserExtract(body: ParserExtractBody, env: Env): Promise<Response> {
  const client = new GhlClient(env);
  // ... the entire unchanged remainder of the original handleParserExtract body ...
```

`body` no longer needs `req` after validation (verified in the deployed code),
so `runParserExtract(body, env)` is sufficient. Use the file's actual types
for `body`/`Env`.

## Edit 5 — `proxy/src/tos/parser-handlers.ts` (~line 368, handoff Item 5)

The parse-failure return whose body is
`{ ok: false, parseError, transactionId, storedPacketId, hint }` —
change `}, 500);` to `}, 200);`. (The comment above it already says
"Return 200 not 500".)

## Edit 6 (optional, cosmetic) — onboarding runbook HTML

The embedded onboarding page's "Flip the right kill switches" step (step 4 in
the HTML served by the worker — find the `WAIT</strong> on
<code>tos_deadline_reminders_enabled` text in the TS source) was updated on
the deployed bundle to reflect the completed go-live: all switches shown as
on, shadow off + cutover 100 since 2026-06-11, and a warning that
`tos_google_review_url` is still unset. Mirror the same text in the TS source
or the next local deploy reverts the page to the stale "WAIT" guidance.

---

## Paste-able prompt for Claude Code on the Mac

> Apply the five edits described in `tos-proxy/PORTING-TO-TS.md` from the
> the-listing-team-development-repository repo (or paste this file) to
> `proxy/src/tos/admin-stats.ts`, `proxy/src/tos/intake-handlers.ts`, and
> `proxy/src/tos/parser-handlers.ts` in this workspace. These mirror what is
> already deployed on tos-proxy-staging — do not add anything else. After each
> edit run `cd proxy && npx tsc --noEmit` and require exit 0. Do NOT deploy
> unless I say so. For reference, the deployed JS form of these changes is
> commit f8353dc in the repo.
