import { NextResponse } from "next/server";
import { authorizeUrl } from "@/lib/ghl/oauth";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.redirect(authorizeUrl());
}
