import { NextRequest, NextResponse } from "next/server";
import { decryptGhlSso, mapGhlRole } from "@/lib/ghl/sso";
import { supabaseAdmin } from "@/lib/supabase/server";
import { encodeSession, SESSION_COOKIE_NAME, SESSION_MAX_AGE } from "@/lib/auth/session";

export const runtime = "nodejs";

// GHL Custom Menu Link calls this with the encrypted SSO token. We decrypt,
// upsert the user, mint a signed session cookie, then redirect into /dashboard.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("sso-session") ?? req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing sso-session" }, { status: 400 });

  let payload;
  try {
    payload = decryptGhlSso(token, process.env.GHL_SSO_KEY!);
  } catch (e) {
    return NextResponse.json({ error: "Invalid SSO token" }, { status: 401 });
  }
  if (!payload.userId) return NextResponse.json({ error: "Bad payload" }, { status: 400 });

  const role = mapGhlRole(payload);
  const db = supabaseAdmin();
  const { data: user, error } = await db
    .from("users")
    .upsert(
      {
        ghl_user_id: payload.userId,
        ghl_location_id: payload.locationId ?? "",
        email: payload.email ?? "",
        name: payload.userName ?? null,
        role,
      },
      { onConflict: "ghl_user_id" },
    )
    .select("id, role, ghl_location_id, email")
    .single();

  if (error || !user) {
    return NextResponse.json({ error: "User upsert failed" }, { status: 500 });
  }

  const cookie = await encodeSession({
    userId: user.id,
    ghlUserId: payload.userId,
    ghlLocationId: user.ghl_location_id,
    email: user.email,
    role: user.role,
  });

  const res = NextResponse.redirect(new URL("/dashboard", req.url));
  res.cookies.set(SESSION_COOKIE_NAME, cookie, {
    httpOnly: true,
    secure: true,
    sameSite: "none", // GHL embeds us in an iframe
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
