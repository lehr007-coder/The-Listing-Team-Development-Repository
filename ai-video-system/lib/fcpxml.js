// FCPXML MCP pipeline client.
//
// Submits a director-agent storyboard to the FCPXML render service. The
// remote service generates the .fcpxml, runs the cinematic edit, returns
// MP4 + GIF + thumbnails + vertical crops via signed callback.

export async function submitFcpxmlRender(env, opts) {
  const {
    jobId,
    storyboard,         // [{ scene_id, source_clip, in, out, captions, overlays, transitions }]
    captions,           // global caption track config
    overlays,           // brand watermark, lower-thirds
    music,              // { url, mood, ducking }
    aspect = "9:16",    // "9:16" | "1:1" | "16:9"
    duration_target_s = 45,
    callbackUrl,
    metadata = {},
  } = opts;

  const r = await fetch(`${env.FCPXML_MCP_URL}/render`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": env.FCPXML_MCP_API_KEY,
    },
    body: JSON.stringify({
      job_id: jobId,
      storyboard,
      captions,
      overlays,
      music,
      aspect,
      duration_target_s,
      callback_url: callbackUrl,
      metadata,
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(`FCPXML submitFcpxmlRender failed: ${r.status} ${JSON.stringify(data)}`);
  }
  return {
    fcpxmlJobId: data.job_id || data.id,
    raw: data,
  };
}

export async function getFcpxmlStatus(env, fcpxmlJobId) {
  const r = await fetch(`${env.FCPXML_MCP_URL}/render/${fcpxmlJobId}`, {
    headers: { "X-Api-Key": env.FCPXML_MCP_API_KEY },
  });
  if (!r.ok) throw new Error(`FCPXML getFcpxmlStatus ${fcpxmlJobId} failed: ${r.status}`);
  return r.json();
}
