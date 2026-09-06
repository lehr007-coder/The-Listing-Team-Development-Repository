# LiveAvatar — live conversational avatar (scaffolding)

## What this is, and what it is not

HeyGen ships two unrelated products:

| | Pre-rendered HEYGEN pipeline (existing) | LiveAvatar (this doc) |
|---|---|---|
| Product | `api.heygen.com` — "Create an avatar video" | `api.liveavatar.com` — separate platform, formerly "Interactive Avatar" |
| API key | `HEYGEN_API_KEY` | `LIVEAVATAR_API_KEY` — **not compatible** with the HeyGen key |
| Output | An MP4, rendered async, delivered via SMS/email/GHL | A live, real-time, two-way WebRTC video conversation |
| Billing | Per video-minute rendered | Per session-minute streamed, while connected |
| Code | `lib/heygen.js`, `routes/heygen.js` | `lib/liveavatar.js`, `routes/liveavatar.js`, `lib/liveavatar-widget.js` |

This module lets a visitor who just watched their personalized HEYGEN video
click **"Talk live now"** on the hosted player page (`/v/:jobId`) and have a
live spoken conversation with an avatar that knows the property and why they
were sent the video — instead of only reading a script someone recorded
earlier.

## Status: **off by default, not yet gone live**

`LIVEAVATAR_ENABLED = "false"` in both `wrangler.toml` and
`wrangler.staging.toml`. Until it's flipped to `"true"` **and**
`LIVEAVATAR_API_KEY` is set:

- The "Talk live" button never renders on the hosted player page.
- `POST /v1/liveavatar/session` always returns `503 liveavatar_disabled`.

Nothing about the existing HEYGEN pipeline changes. This is purely additive,
same isolation posture as the rest of the sidecar (see `docs/ARCHITECTURE.md`).

## Why "scaffolding" — what's confirmed vs. guessed

`docs.liveavatar.com` blocks every automated fetch attempt (403 from a
Cloudflare-style bot check) — including from this build session. Two things
*are* independently confirmed, from the real `@heygen/liveavatar-web-sdk`
package (pulled via `npm pack` and read from its compiled source, not just
the README):

- **Base URL:** `https://api.liveavatar.com`
- **Auth:** backend mints a short-lived `session_token` via
  `POST /v1/sessions/token` with an `X-API-KEY` header (our
  `LIVEAVATAR_API_KEY`, never sent to the browser). The browser SDK then
  calls `POST /v1/sessions/start` with `Authorization: Bearer <session_token>`
  to get `{ session_id, max_session_duration, livekit_url,
  livekit_client_token, ws_url }` and connects straight to LiveKit — our
  worker is never in the WebRTC/media path.
- **Client SDK surface** (`lib/liveavatar-widget.js` uses this directly,
  confirmed from `node_modules`-equivalent source, not guessed):
  `new LiveAvatarSession(sessionToken, { voiceChat: true })`, then
  `.start()` / `.stop()` / `.attach(videoEl)` / `.on(SessionEvent...)`.

**NOT confirmed — verify before flipping `LIVEAVATAR_ENABLED`:** the exact
request-body field names for `POST /v1/sessions/token` in
`lib/liveavatar.js#mintSessionToken`. `avatar_id` and `mode` (from the SDK's
own `SessionMode.FULL | LITE` enum) are near-certain. The `context` field
(used to tell the avatar which property/contact it's talking about) is a
guess — the real API may call it `knowledge_base` or `system_prompt`, or
require a separate `POST /v1/contexts` call first and a `context_id`
reference instead of inline text (the docs search summary mentioned v1
"contexts" as its own resource, distinct from sessions).

## Go-live checklist

1. **Sign up.** Create an account at `app.liveavatar.com` (this needs a
   human — not something that can be scripted from here), then generate an
   API key at `app.liveavatar.com/developers`.
2. **Create an avatar** in the LiveAvatar dashboard. Note its `avatar_id`.
3. **Verify the `/v1/sessions/token` request body** against
   `docs.liveavatar.com/api-reference/sessions/create-session-token` in a
   real logged-in browser (this doc's own automated attempts were blocked).
   Confirm the field name for injecting property/contact context, and
   whether `max_session_duration` is actually honored server-side. Update
   `lib/liveavatar.js#mintSessionToken` if the guessed field names are wrong
   — the `overrides` param exists specifically so this is a one-call-site
   fix, not a rewrite.
4. **Set secrets + vars:**
   ```sh
   cd ai-video-system
   npx wrangler@latest secret put LIVEAVATAR_API_KEY --config wrangler.staging.toml
   # then set LIVEAVATAR_DEFAULT_AVATAR_ID and LIVEAVATAR_ENABLED="true"
   # in wrangler.staging.toml [vars], deploy, and test end-to-end on staging
   # before repeating against wrangler.toml (production).
   ```
5. **Apply the migration:** `migrations/003_liveavatar_sessions.sql` against
   the `ylopo-intelligence` Supabase project (same one as `001`/`002`).
6. **Test end-to-end on staging** (see below) before touching production.
7. **Watch cost.** LiveAvatar bills per-minute of connected session, unlike
   the one-shot HEYGEN render cost — see "Cost guardrails" below.

## Cost guardrails

Three independent layers (mirrors the render pipeline's kill-switch +
rate-limit pattern in `lib/util.js` / `lib/rate-limit.js`, but under a
**separate** KV key so pausing one pipeline doesn't pause the other):

| Control | Default | Where |
|---|---|---|
| Feature flag | off | `LIVEAVATAR_ENABLED` env var, redeploy to flip |
| Kill-switch | off | `POST/DELETE /v1/admin/liveavatar/kill` — instant, no redeploy |
| Daily session cap (global) | 20 prod / 10 staging | `LIVEAVATAR_DAILY_SESSION_LIMIT` |
| Daily session cap (per contact) | 2 prod / 3 staging | `LIVEAVATAR_PER_CONTACT_DAILY_LIMIT` |
| Max session duration | 300s (5 min) | `LIVEAVATAR_MAX_SESSION_SECONDS` — sent to LiveAvatar at mint time AND enforced client-side by the widget's own hard timeout regardless of whether the server honors it |

Per LiveAvatar's published pricing (see the widget's cost-estimate comment
in `routes/liveavatar.js#endSession`), Full-mode sessions run roughly
$0.19–0.25/minute — meaningfully more expensive per-incident than a stuck
video render, hence the tighter default caps and the belt-and-suspenders
duration enforcement.

## Architecture

```
Visitor clicks "Talk live now" on /v/:jobId (routes/hosted.js)
  → loads /v1/liveavatar/widget.js (lib/liveavatar-widget.js, templated JS)
  → POST /v1/liveavatar/session { job_id, contact_id }   (routes/liveavatar.js)
      • checks LIVEAVATAR_ENABLED, kill-switch, daily rate caps
      • pulls job/listing/contact context (lib/supabase.js) → lib/liveavatar.js#buildAvatarContext
      • mints a session_token via LiveAvatar (lib/liveavatar.js#mintSessionToken)
      • inserts a liveavatar_sessions row (status='active')
  ← { session_token, session_row_id, max_duration_s }
  → browser: new LiveAvatarSession(session_token) — connects DIRECTLY to
    LiveAvatar's LiveKit infra. Our worker is not in the media path.
  → on hangup/disconnect/timeout: POST /v1/liveavatar/session/:id/end
    (best-effort — sendBeacon on tab close) → liveavatar_sessions.status='ended'
```

## Testing (staging, before go-live)

```sh
# Confirm the flag is actually on and the key is set
curl -s https://ai-video-system-staging.<...>.workers.dev/v1/admin/liveavatar/kill \
  -H "X-API-Key: $KEY" | jq

# Mint a session directly (no browser) to confirm the upstream call succeeds
curl -s -X POST https://ai-video-system-staging.<...>.workers.dev/v1/liveavatar/session \
  -H "Content-Type: application/json" -d '{}' | jq

# If that 200s with a session_token, open a test job's hosted page in a
# real browser and click "Talk live now" to confirm the SDK connects.
```

## Known follow-ups (out of scope for this pass)

- No server-side reconciliation against LiveAvatar's own usage/billing API
  yet — `credits_estimated` in `liveavatar_sessions` is a rough estimate
  computed from client-reported duration, not authoritative. A closed
  browser tab can silently under-report duration despite the `sendBeacon`
  best-effort — reconcile periodically against LiveAvatar's own dashboard.
- `listAvatars()` in `lib/liveavatar.js` guesses the `GET /v1/avatars` path;
  not wired into the admin dashboard UI yet (no avatar picker), just
  available for a future admin panel.
- Only wired into the hosted video-player page so far. Extending to a
  standalone website widget or a GHL funnel page is a small follow-up —
  `lib/liveavatar-widget.js` already reads `job_id`/`contact_id` from
  `data-*` attributes, so it just needs a new `<script>` tag placement, not
  new code.
