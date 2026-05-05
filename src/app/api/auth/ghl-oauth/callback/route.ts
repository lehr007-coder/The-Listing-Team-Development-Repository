import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/ghl/oauth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });
  try {
    await exchangeCode(code);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "OAuth exchange failed" },
      { status: 500 },
    );
  }
  return NextResponse.redirect(new URL("/admin?installed=1", req.url));
}
