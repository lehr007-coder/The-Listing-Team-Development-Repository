// Shared HTTP / auth / CORS helpers.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key, X-Signature, X-Render-Job-Id",
  "Access-Control-Max-Age": "86400",
};

export function cors(response) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return new Response(response.body, { status: response.status, headers });
}

export function corsResponse() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

export function error(status, code, message, extra = {}) {
  return json({ error: code, message, ...extra }, status);
}

export function requireApiKey(request, env) {
  const expected = env.PROXY_API_KEY || env.AI_VIDEO_API_KEY || "";
  if (!expected) {
    return error(503, "auth_unconfigured", "PROXY_API_KEY / AI_VIDEO_API_KEY not set");
  }
  const provided =
    request.headers.get("X-API-Key") ||
    (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (provided && timingSafeEqual(provided, expected)) return null;
  return error(401, "unauthorized", "Invalid or missing API key");
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// HMAC-SHA256 for signed callback verification (HeyGen / FCPXML MCP)
export async function verifyHmacSignature(payloadText, signatureHex, secret) {
  if (!signatureHex || !secret) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]
  );
  const expected = await crypto.subtle.sign("HMAC", key, enc.encode(payloadText));
  const expectedHex = bufToHex(expected);
  return timingSafeEqual(expectedHex, signatureHex.replace(/^sha256=/, ""));
}

export function bufToHex(buf) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Body parser that tolerates JSON, form-urlencoded, and multipart payloads.
// GHL's standard Webhook sends application/json with stringy values; some
// other systems send form-encoded. Returns { text, body } with body as a
// plain object regardless of input encoding.
export async function readJson(request) {
  try {
    const ct = (request.headers.get("Content-Type") || "").toLowerCase();
    if (ct.includes("application/x-www-form-urlencoded")) {
      const text = await request.text();
      const params = new URLSearchParams(text);
      const body = {};
      for (const [k, v] of params) body[k] = v;
      return { text, body };
    }
    if (ct.includes("multipart/form-data")) {
      const form = await request.formData();
      const body = {};
      for (const [k, v] of form.entries()) body[k] = typeof v === "string" ? v : v.name;
      return { text: "", body };
    }
    const text = await request.text();
    return { text, body: text ? JSON.parse(text) : {} };
  } catch (e) {
    return { text: "", body: null, parseError: e.message };
  }
}

export function newJobId(prefix = "vj") {
  const rand = crypto.getRandomValues(new Uint8Array(8));
  const hex = Array.from(rand).map(b => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${Date.now().toString(36)}_${hex}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function safe(obj, path, fallback = null) {
  return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj) ?? fallback;
}

// Kill-switch — when active, /v1/heygen/render and /v1/fcpxml/render
// refuse new renders with 503. In-flight jobs continue. Backed by KV
// so it's instant (no redeploy needed) and survives across restarts.
const KILL_SWITCH_KEY = "kill_switch";

export async function isKilled(env) {
  if (!env.VIDEO_KV) return false;
  const v = await env.VIDEO_KV.get(KILL_SWITCH_KEY);
  return v === "on";
}

export async function setKillSwitch(env, on, meta = {}) {
  if (!env.VIDEO_KV) throw new Error("VIDEO_KV not bound");
  if (on) {
    const payload = JSON.stringify({
      reason: meta.reason || "",
      set_at: new Date().toISOString(),
      set_by: meta.set_by || "api",
    });
    await env.VIDEO_KV.put(KILL_SWITCH_KEY, "on", { metadata: payload });
    return { killed: true, ...JSON.parse(payload) };
  }
  await env.VIDEO_KV.delete(KILL_SWITCH_KEY);
  return { killed: false };
}

export async function killSwitchState(env) {
  if (!env.VIDEO_KV) return { killed: false, reason: "no_kv" };
  const { value, metadata } = await env.VIDEO_KV.getWithMetadata(KILL_SWITCH_KEY);
  if (value !== "on") return { killed: false };
  let parsed = {};
  try { parsed = typeof metadata === "string" ? JSON.parse(metadata) : (metadata || {}); } catch {}
  return { killed: true, ...parsed };
}
