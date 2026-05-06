// HeyGen API client.
// https://docs.heygen.com/reference/create-an-avatar-video-v2

const HEYGEN_BASE = "https://api.heygen.com";

function heygenHeaders(env) {
  return {
    "X-Api-Key": env.HEYGEN_API_KEY,
    "Content-Type": "application/json",
  };
}

// Submit an avatar video render. The callback URL receives the video_url
// when rendering completes.
export async function createAvatarVideo(env, opts) {
  const {
    script,
    avatarId = env.HEYGEN_DEFAULT_AVATAR_ID,
    voiceId = env.HEYGEN_DEFAULT_VOICE_ID,
    background = "#0a0a0a",
    width = 1080,
    height = 1920, // vertical for SMS/social-friendly aspect
    callbackUrl,
    metadata = {},
  } = opts;

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
