import { cookies } from "next/headers";

const COOKIE = "lt_session";
const MAX_AGE = 60 * 60 * 12; // 12h

export type Session = {
  userId: string;
  ghlUserId: string;
  ghlLocationId: string;
  email: string;
  role: "admin" | "agent";
  iat: number;
};

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (>=32 chars)");
  return s;
}

// Web Crypto so this works in both the Node and Edge runtimes (middleware
// runs on Edge and can't use node:crypto).
async function hmacKey() {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function b64url(bytes: ArrayBuffer | Uint8Array) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const u8 = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) u8[i] = b.charCodeAt(i);
  return u8;
}

async function sign(value: string): Promise<string> {
  const data = new TextEncoder().encode(value) as unknown as BufferSource;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), data);
  return b64url(sig);
}

export async function encodeSession(s: Omit<Session, "iat">): Promise<string> {
  const payload = JSON.stringify({ ...s, iat: Date.now() });
  const body = b64url(new TextEncoder().encode(payload));
  const sig = await sign(body);
  return `${body}.${sig}`;
}

export async function decodeSession(raw: string | undefined): Promise<Session | null> {
  if (!raw) return null;
  const [body, sig] = raw.split(".");
  if (!body || !sig) return null;
  const ok = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(),
    fromB64url(sig) as unknown as BufferSource,
    new TextEncoder().encode(body) as unknown as BufferSource,
  );
  if (!ok) return null;
  try {
    const json = new TextDecoder().decode(fromB64url(body));
    const parsed = JSON.parse(json) as Session;
    if (Date.now() - parsed.iat > MAX_AGE * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const c = await cookies();
  return decodeSession(c.get(COOKIE)?.value);
}

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new Error("UNAUTHENTICATED");
  return s;
}

export const SESSION_COOKIE_NAME = COOKIE;
export const SESSION_MAX_AGE = MAX_AGE;
