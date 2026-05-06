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

export async function readJson(request) {
  try {
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
