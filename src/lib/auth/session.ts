import crypto from "node:crypto";
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

function sign(value: string) {
  return crypto.createHmac("sha256", secret()).update(value).digest("base64url");
}

export function encodeSession(s: Omit<Session, "iat">): string {
  const payload = JSON.stringify({ ...s, iat: Date.now() });
  const body = Buffer.from(payload, "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

export function decodeSession(raw: string | undefined): Session | null {
  if (!raw) return null;
  const [body, sig] = raw.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  // timingSafeEqual requires equal length
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Session;
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
