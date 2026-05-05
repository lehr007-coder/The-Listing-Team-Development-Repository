import { NextRequest, NextResponse } from "next/server";
import { decodeSession } from "@/lib/auth/session";

const PROTECTED = ["/dashboard", "/contacts", "/leaderboard", "/admin"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }
  const session = decodeSession(req.cookies.get("lt_session")?.value);
  if (!session) return NextResponse.redirect(new URL("/", req.url));
  if (pathname.startsWith("/admin") && session.role !== "admin") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/contacts/:path*", "/leaderboard/:path*", "/admin/:path*"],
};
