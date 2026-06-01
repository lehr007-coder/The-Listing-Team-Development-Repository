// GHL Agent Studio invocation.
//
// Each AI Video agent is created in Agent Studio with the prompts in
// /agents/*.md and a publish endpoint that returns JSON. We POST the
// context, the agent runs, and we get back structured output.
//
// If GHL Agent Studio is not yet wired up for direct API calls, falls back
// to a direct OpenAI/Anthropic call gated on AGENT_FALLBACK_PROVIDER.

const AGENT_ENDPOINTS = {
  heygen_script:        "AGENT_HEYGEN_SCRIPT_URL",
  fcpxml_director:      "AGENT_FCPXML_DIRECTOR_URL",
  video_delivery:       "AGENT_VIDEO_DELIVERY_URL",
  social_content:       "AGENT_SOCIAL_CONTENT_URL",
};

export const AGENT_NAMES = Object.keys(AGENT_ENDPOINTS);

export function agentEndpointVar(agentName) {
  return AGENT_ENDPOINTS[agentName];
}

export async function invokeAgent(env, agentName, context) {
  const endpointVar = AGENT_ENDPOINTS[agentName];
  if (!endpointVar) throw new Error(`Unknown agent: ${agentName}`);

  const url = env[endpointVar];
  if (url) return invokeViaAgentStudio(env, url, context);

  return invokeViaFallback(env, agentName, context);
}

// Cap every agent API call so a slow LLM backend can't burn the queue
// consumer's 15-min wall-clock. Claude Sonnet at max_tokens=8192 normally
// returns in 5-30s; 90s gives generous headroom while ensuring a stuck
// request fails fast as a step error rather than letting Cloudflare kill
// the worker externally and leave the claim dangling.
const AGENT_TIMEOUT_MS = 90_000;
const agentSignal = () => AbortSignal.timeout(AGENT_TIMEOUT_MS);

async function invokeViaAgentStudio(env, url, context) {
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.GHL_AGENT_STUDIO_TOKEN || env.GHL_V2_TOKEN}`,
    },
    body: JSON.stringify({ input: context }),
    signal: agentSignal(),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Agent Studio call failed: ${r.status} ${JSON.stringify(data)}`);
  // Agent Studio publishes can return either {output: {...}} or the JSON directly.
  return data.output ?? data.result ?? data;
}

async function invokeViaFallback(env, agentName, context) {
  const provider = (env.AGENT_FALLBACK_PROVIDER || "anthropic").toLowerCase();
  if (provider === "anthropic") return callAnthropic(env, agentName, context);
  if (provider === "openai")    return callOpenAi(env, agentName, context);
  throw new Error(`No agent endpoint configured and unsupported fallback: ${provider}`);
}

const FALLBACK_SYSTEM = {
  heygen_script: `You are the HEYGEN SCRIPT AGENT for The Listing Team. Generate a concise, conversational 30–60 second avatar script in JSON: {"script": "...", "sms_copy": "...", "email_subject": "...", "email_html": "...", "cta_text": "...", "cta_url_token": "{{HOSTED_URL}}", "tone": "warm|urgent|consultative", "duration_target_s": 45 }. Personalize using contact + Ylopo + valuation data. Use {{firstName}} placeholders only if the data is missing. Never output anything outside the JSON.`,
  fcpxml_director: `You are the FCPXML VIDEO DIRECTOR AGENT. Produce a JSON storyboard for a cinematic 30–60s vertical (9:16) reel: {"storyboard": [{"scene_id": 1, "source_clip": "...", "in": "0s", "out": "3s", "captions": "...", "overlays": [], "transitions": "cut|fade|whip"}], "captions_global": {...}, "overlays_global": {...}, "music": {...}, "social_caption_tiktok": "...", "social_caption_instagram": "...", "social_caption_youtube_shorts": "...", "hashtags": [...], "duration_target_s": 45}. Use only listing/branding data provided. Never output anything outside the JSON.`,
  video_delivery: `You are the VIDEO DELIVERY AGENT. Generate ONLY the personalized copy that the worker's server-rendered email + SMS templates wrap. Output strict JSON: {"sms_copy": "<body only, no URL, no name prefix; ≤240 chars>", "email_subject": "<≤80 chars, optional>", "email_body_copy": "<2-3 conversational sentences for the email body — no greeting, no signoff, no HTML>", "cta_text": "<button label ≤32 chars>", "conversation_note": "<≤200 char GHL conversation note>"}. Never output HTML. Never include the hosted URL in any field — the worker injects it. Match tone to video_type. Output JSON only.`,
  social_content: `You are the SOCIAL CONTENT AGENT. Output JSON with platform-specific captions, hashtags, and short hooks for the rendered video: {"tiktok": {"caption": "...", "hashtags": [...], "hook": "..."}, "instagram_reels": {...}, "instagram_stories": {...}, "facebook_reels": {...}, "facebook_stories": {...}, "youtube_shorts": {"title": "...", "description": "...", "tags": [...]}}.`,
};

async function callAnthropic(env, agentName, context) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: env.AGENT_MODEL || "claude-sonnet-4-6",
      // Director storyboards are long (multi-scene + captions + per-platform copy).
      // Other agents are smaller but cheap to allow the same headroom.
      max_tokens: 8192,
      system: FALLBACK_SYSTEM[agentName],
      messages: [{ role: "user", content: JSON.stringify(context) }],
    }),
    signal: agentSignal(),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`Anthropic fallback failed: ${r.status} ${JSON.stringify(data)}`);
  const text = data.content?.[0]?.text || "{}";
  return JSON.parse(extractJson(text));
}

async function callOpenAi(env, agentName, context) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.AGENT_MODEL || "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: FALLBACK_SYSTEM[agentName] },
        { role: "user", content: JSON.stringify(context) },
      ],
    }),
    signal: agentSignal(),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`OpenAI fallback failed: ${r.status} ${JSON.stringify(data)}`);
  return JSON.parse(data.choices[0].message.content);
}

// Extract a JSON object from possibly-fenced or prose-wrapped agent output.
// 1. strip ```json ... ``` or ``` ... ``` fences
// 2. find the first {, walk forward tracking brace depth + string state to
//    find the matching }. This handles strings containing braces and avoids
//    a greedy match that can break on multiple top-level objects.
function extractJson(text) {
  let s = text || "";
  s = s.replace(/^```(?:json|javascript|js)?\s*/i, "").replace(/```\s*$/i, "");
  const start = s.indexOf("{");
  if (start < 0) return "{}";
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (c === "\\") { esc = true; continue; }
      if (c === '"') inStr = false;
    } else {
      if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) return s.slice(start, i + 1);
      }
    }
  }
  // unterminated — return what we have so the caller surfaces the parse error
  return s.slice(start);
}
