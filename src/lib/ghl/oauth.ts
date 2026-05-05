import { supabaseAdmin } from "@/lib/supabase/server";

const TOKEN_URL = "https://services.leadconnectorhq.com/oauth/token";
const AUTHORIZE_URL = "https://marketplace.gohighlevel.com/oauth/chooselocation";

export const GHL_SCOPES = [
  "contacts.readonly",
  "contacts.write",
  "locations.readonly",
  "users.readonly",
].join(" ");

export function authorizeUrl() {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.GHL_OAUTH_CLIENT_ID!,
    redirect_uri: process.env.GHL_OAUTH_REDIRECT_URI!,
    scope: GHL_SCOPES,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  locationId?: string;
  companyId?: string;
};

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GHL_OAUTH_CLIENT_ID!,
      client_secret: process.env.GHL_OAUTH_CLIENT_SECRET!,
      ...body,
    }),
  });
  if (!res.ok) throw new Error(`GHL token exchange failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as TokenResponse;
}

export async function exchangeCode(code: string) {
  const t = await postToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: process.env.GHL_OAUTH_REDIRECT_URI!,
  });
  await persistTokens(t);
  return t;
}

export async function refreshLocation(locationId: string) {
  const db = supabaseAdmin();
  const { data: row } = await db
    .from("ghl_oauth_tokens")
    .select("refresh_token")
    .eq("location_id", locationId)
    .single();
  if (!row) throw new Error(`No tokens for location ${locationId}`);
  const t = await postToken({ grant_type: "refresh_token", refresh_token: row.refresh_token });
  await persistTokens({ ...t, locationId });
  return t;
}

async function persistTokens(t: TokenResponse) {
  if (!t.locationId) throw new Error("Token response missing locationId");
  const expiresAt = new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString();
  await supabaseAdmin()
    .from("ghl_oauth_tokens")
    .upsert(
      {
        location_id: t.locationId,
        company_id: t.companyId ?? null,
        access_token: t.access_token,
        refresh_token: t.refresh_token,
        expires_at: expiresAt,
        scope: t.scope,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "location_id" },
    );
}
