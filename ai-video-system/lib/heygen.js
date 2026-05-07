// HeyGen API client.
// https://docs.heygen.com/reference/create-an-avatar-video-v2

const HEYGEN_BASE = "https://api.heygen.com";

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

// Submit an avatar video render. The callback URL receives the video_url
// when rendering completes.
export async function createAvatarVideo(env, opts) {
  const {
    script,
    avatarId = env.HEYGEN_DEFAULT_AVATAR_ID,
    voiceId = env.HEYGEN_DEFAULT_VOICE_ID,
    background = "#0a0a0a",
    aspect,                          // "9:16" | "16:9" | "1:1" | "4:5"
    width: rawWidth,
    height: rawHeight,
    callbackUrl,
    metadata = {},
  } = opts;

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

export async function getRenderStatus(env, heygenVideoId) {
  const r = await fetch(
    `${HEYGEN_BASE}/v1/video_status.get?video_id=${heygenVideoId}`,
    { headers: heygenHeaders(env) }
  );
  if (!r.ok) throw new Error(`HeyGen getRenderStatus ${heygenVideoId} failed: ${r.status}`);
  return r.json();
}
