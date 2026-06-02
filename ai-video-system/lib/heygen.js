// HeyGen API client.
// https://docs.heygen.com/reference/create-an-avatar-video-v2

const HEYGEN_BASE = "https://api.heygen.com";

// Defensive wall-clock cap on every HeyGen API call. The cron
// poll-fallback iterates over stuck-rendering jobs calling
// getRenderStatus on each; an unbounded fetch lets a single slow
// HeyGen response stall the whole cron tick (and any retries),
// effectively starving every other stuck job of polling and
// silently leaving them in 'rendering' forever. 30s is generous
// — HeyGen's status endpoint is normally sub-second.
const HEYGEN_TIMEOUT_MS = 30_000;
const heygenSignal = () => AbortSignal.timeout(HEYGEN_TIMEOUT_MS);

function heygenHeaders(env) {
  return {
    "X-Api-Key": env.HEYGEN_API_KEY,
    "Content-Type": "application/json",
  };
}

// Map a friendly aspect-ratio name → HeyGen pixel dimensions.
// HeyGen accepts dimension: { width, height } in v2 /video/generate.
const ASPECT_DIMS = {
  "9:16":  { width: 1080, height: 1920 }, // vertical — SMS, mobile, IG/TikTok
  "16:9":  { width: 1920, height: 1080 }, // horizontal — email, desktop, YT
  "1:1":   { width: 1080, height: 1080 }, // square — IG feed
  "4:5":   { width: 1080, height: 1350 }, // IG portrait feed
};

// One HeyGen template per video_type. The avatar + voice + branded
// intro/outro/lower-third are baked into each template by the user in
// the HeyGen dashboard; the worker only supplies the script as a
// `{{script}}` variable. Falls back to the raw /v2/video/generate path
// (HEYGEN_DEFAULT_AVATAR_ID + HEYGEN_DEFAULT_VOICE_ID) if a template ID
// isn't configured for the requested video_type.
const VIDEO_TYPE_TEMPLATE_VAR = {
  seller_valuation:      "HEYGEN_TEMPLATE_SELLER_VALUATION",
  fsbo_outreach:         "HEYGEN_TEMPLATE_FSBO_OUTREACH",
  expired_listing:       "HEYGEN_TEMPLATE_EXPIRED_LISTING",
  buyer_activity:        "HEYGEN_TEMPLATE_BUYER_ACTIVITY",
  new_listing_match:     "HEYGEN_TEMPLATE_NEW_LISTING_MATCH",
  market_update:         "HEYGEN_TEMPLATE_MARKET_UPDATE",
  open_house_invite:     "HEYGEN_TEMPLATE_OPEN_HOUSE_INVITE",
  showing_request:       "HEYGEN_TEMPLATE_SHOWING_REQUEST",
  appointment_reminder:  "HEYGEN_TEMPLATE_APPOINTMENT_REMINDER",
  mortgage_update:       "HEYGEN_TEMPLATE_MORTGAGE_UPDATE",
  lead_nurture:          "HEYGEN_TEMPLATE_LEAD_NURTURE",
  priority_lead:         "HEYGEN_TEMPLATE_PRIORITY_LEAD",
};

function templateIdFor(env, videoType) {
  const varName = VIDEO_TYPE_TEMPLATE_VAR[videoType];
  return varName ? (env[varName] || null) : null;
}

// Submit an avatar video render. The callback URL receives the video_url
// when rendering completes.
//
// If a HeyGen template ID is configured for opts.videoType, uses the
// branded template endpoint (POST /v2/template/{id}/generate) — the
// avatar, voice, intro/outro slate, lower-third, and music are all baked
// into the template so we only supply the script as a variable.
// Otherwise falls back to the raw /v2/video/generate path using the
// default avatar + voice secrets.
export async function createAvatarVideo(env, opts) {
  const {
    script,
    videoType,
    avatarId = env.HEYGEN_DEFAULT_AVATAR_ID,
    voiceId = env.HEYGEN_DEFAULT_VOICE_ID,
    background = "#0a0a0a",
    aspect,                          // "9:16" | "16:9" | "1:1" | "4:5"
    width: rawWidth,
    height: rawHeight,
    callbackUrl,
    metadata = {},
  } = opts;

  const templateId = templateIdFor(env, videoType);
  if (templateId) {
    return createFromTemplate(env, templateId, { script, callbackUrl, metadata });
  }

  const dims = ASPECT_DIMS[aspect] || null;
  const width  = rawWidth  || dims?.width  || 1080;
  const height = rawHeight || dims?.height || 1920;

  const body = {
    video_inputs: [
      {
        character: {
          type: "avatar",
          avatar_id: avatarId,
          avatar_style: "normal",
        },
        voice: {
          type: "text",
          input_text: script,
          voice_id: voiceId,
        },
        background: typeof background === "string" && background.startsWith("#")
          ? { type: "color", value: background }
          : background,
      },
    ],
    dimension: { width, height },
    test: env.ENVIRONMENT !== "production",
    callback_url: callbackUrl,
    callback_id: metadata.job_id || undefined,
  };

  const r = await fetch(`${HEYGEN_BASE}/v2/video/generate`, {
    method: "POST",
    headers: heygenHeaders(env),
    body: JSON.stringify(body),
    signal: heygenSignal(),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(`HeyGen createAvatarVideo failed: ${r.status} ${JSON.stringify(data)}`);
  }
  return {
    heygenVideoId: data.data?.video_id || data.video_id,
    raw: data,
  };
}

// POST /v2/template/{template_id}/generate with the script as a {{script}}
// text variable. The template itself owns the avatar/voice/branding.
async function createFromTemplate(env, templateId, { script, callbackUrl, metadata }) {
  const body = {
    caption: false,
    title: `vj ${metadata.job_id || ""}`.trim(),
    callback_id: metadata.job_id || undefined,
    callback_url: callbackUrl || undefined,
    test: env.ENVIRONMENT !== "production",
    variables: {
      script: {
        name: "script",
        type: "text",
        properties: { content: script },
      },
    },
  };
  const r = await fetch(`${HEYGEN_BASE}/v2/template/${templateId}/generate`, {
    method: "POST",
    headers: heygenHeaders(env),
    body: JSON.stringify(body),
    signal: heygenSignal(),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(`HeyGen template ${templateId} generate failed: ${r.status} ${JSON.stringify(data)}`);
  }
  return {
    heygenVideoId: data.data?.video_id || data.video_id,
    template_id: templateId,
    via: "template",
    raw: data,
  };
}

export async function getRenderStatus(env, heygenVideoId) {
  const r = await fetch(
    `${HEYGEN_BASE}/v1/video_status.get?video_id=${heygenVideoId}`,
    { headers: heygenHeaders(env), signal: heygenSignal() }
  );
  if (!r.ok) throw new Error(`HeyGen getRenderStatus ${heygenVideoId} failed: ${r.status}`);
  return r.json();
}
