// LiveAvatar API client — HeyGen's separate real-time conversational-avatar
// product (https://liveavatar.com), NOT the same product/API/key as the
// pre-rendered HEYGEN pipeline in lib/heygen.js.
//
// Confirmed against the shipped @heygen/liveavatar-web-sdk@0.0.18 source
// (npm pack + read compiled JS/d.ts — docs.liveavatar.com blocks
// server-side fetches, so the package source is ground truth here):
//   - Base URL: https://api.liveavatar.com
//   - Browser session flow: our backend mints a short-lived sessionToken via
//     POST /v1/sessions/token (auth: X-API-KEY, our LIVEAVATAR_API_KEY secret
//     — never sent to the browser). The browser SDK then calls
//     POST /v1/sessions/start with `Authorization: Bearer <sessionToken>` to
//     get { session_id, max_session_duration, livekit_url,
//     livekit_client_token, ws_url } and connects to LiveKit directly — our
//     worker is never in the media/WebRTC path.
//
// NOT confirmed (docs.liveavatar.com blocked every automated fetch attempt —
// verify against the real API reference once LIVEAVATAR_API_KEY exists):
//   - Exact POST /v1/sessions/token request body field names. `avatar_id` and
//     `mode` (SessionMode.FULL | LITE, from the SDK's own enum) are near-certain;
//     `context` (the field we use below to inject property/contact info) may
//     actually be `knowledge_base`, `system_prompt`, or require a separate
//     POST /v1/contexts call first + a `context_id` reference — the search
//     summary mentioned v1 "contexts" as its own resource. Do NOT flip
//     LIVEAVATAR_ENABLED=true in production until this is checked against
//     docs.liveavatar.com/api-reference/sessions/create-session-token in a
//     real logged-in browser. See docs/LIVEAVATAR.md "Go-live checklist".
//   - Whether `max_session_duration` set here is actually honored server-side.
//     The widget also enforces LIVEAVATAR_MAX_SESSION_SECONDS client-side via
//     a hard timeout regardless, so cost is bounded either way.

const LIVEAVATAR_BASE = "https://api.liveavatar.com";

const LIVEAVATAR_TIMEOUT_MS = 15_000;
const liveavatarSignal = () => AbortSignal.timeout(LIVEAVATAR_TIMEOUT_MS);

function liveavatarHeaders(env) {
  return {
    "X-API-KEY": env.LIVEAVATAR_API_KEY,
    "Content-Type": "application/json",
  };
}

// Mint a short-lived session token for the browser SDK. The token itself
// (not this call) is what actually starts billing — LiveAvatar bills from
// POST /v1/sessions/start, which the SDK calls client-side once the visitor
// clicks "connect". Minting a token that's never used to start a session
// should not incur cost, but treat mint-call volume as the rate-limit
// surface anyway since it's the only choke point our backend controls.
export async function mintSessionToken(env, opts = {}) {
  const {
    avatarId = env.LIVEAVATAR_DEFAULT_AVATAR_ID,
    mode = env.LIVEAVATAR_MODE || "FULL", // SessionMode.FULL | LITE
    maxSessionDurationSeconds,
    context,
    overrides = {},
  } = opts;

  if (!env.LIVEAVATAR_API_KEY) {
    throw new Error("LIVEAVATAR_API_KEY not configured");
  }
  if (!avatarId) {
    throw new Error("avatarId required (opts.avatarId or LIVEAVATAR_DEFAULT_AVATAR_ID)");
  }

  const body = {
    avatar_id: avatarId,
    mode,
    ...(maxSessionDurationSeconds ? { max_session_duration: maxSessionDurationSeconds } : {}),
    ...(context ? { context } : {}),
    ...overrides, // escape hatch to correct guessed field names without a code change
  };

  const r = await fetch(`${LIVEAVATAR_BASE}/v1/sessions/token`, {
    method: "POST",
    headers: liveavatarHeaders(env),
    body: JSON.stringify(body),
    signal: liveavatarSignal(),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(`LiveAvatar mintSessionToken failed: ${r.status} ${JSON.stringify(data)}`);
  }
  const sessionToken = data.data?.session_token || data.session_token || data.data?.token || data.token;
  if (!sessionToken) {
    throw new Error(`LiveAvatar mintSessionToken: no token in response ${JSON.stringify(data)}`);
  }
  return { sessionToken, raw: data };
}

// Best-effort avatar list for an admin picker. Endpoint path is a guess
// (GET /v1/avatars, mirroring the confirmed /v1/sessions/token shape) —
// never throws so a wrong guess just shows an empty picker instead of
// breaking the admin dashboard.
export async function listAvatars(env) {
  try {
    const r = await fetch(`${LIVEAVATAR_BASE}/v1/avatars`, {
      headers: liveavatarHeaders(env),
      signal: liveavatarSignal(),
    });
    if (!r.ok) return [];
    const data = await r.json();
    return data?.data?.avatars || data?.avatars || data?.data || [];
  } catch {
    return [];
  }
}

// Build a short conversation-scoped context string: who the visitor is (if
// known), what property this session is attached to, and what the avatar is
// for. Kept intentionally brief — this is a system-prompt-style seed, not a
// full intelligence dump like lib/agents.js builds for script generation.
//
// Scope (per product decision): property Q&A + light lead qualification,
// not a full sales conversation. The avatar should hand off to a human via
// the existing GHL pipeline rather than trying to close anything itself.
export function buildAvatarContext({ contact, job, listing } = {}) {
  const lines = [
    "You are a live video assistant for The Listing Team, a real estate team.",
    "Answer questions about the property below when asked, and lightly qualify " +
      "the visitor (timeline, budget range, buying vs. selling) if the conversation " +
      "naturally goes there. Keep answers short and conversational — this is a live " +
      "voice conversation, not a written response. Never invent listing details, " +
      "pricing, or availability you were not given below. If asked something you " +
      "don't know, offer to have a human agent follow up.",
  ];

  if (contact?.first_name) {
    lines.push(`Visitor's name: ${contact.first_name}.`);
  }
  if (job?.video_type) {
    lines.push(`They arrived here after watching a personalized "${String(job.video_type).replace(/_/g, " ")}" video.`);
  }
  if (listing) {
    const addr = listing.address || listing.full_address || listing.street_address;
    const price = listing.price || listing.list_price;
    const beds = listing.beds || listing.bedrooms;
    const baths = listing.baths || listing.bathrooms;
    const details = [
      addr ? `Address: ${addr}` : null,
      price ? `Price: $${Number(price).toLocaleString()}` : null,
      beds ? `Beds: ${beds}` : null,
      baths ? `Baths: ${baths}` : null,
    ].filter(Boolean);
    if (details.length) lines.push(`Property details — ${details.join(", ")}.`);
  }

  return lines.join("\n");
}
