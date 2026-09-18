const API = "https://api.cloudflare.com/client/v4";

export interface CloudflareEnvelope<T> {
  success: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  messages?: unknown[];
  result: T;
  result_info?: Record<string, unknown>;
}

export interface CloudflareClientConfig {
  token: string;
  accountId: string;
}

export async function cfGet<T>(config: CloudflareClientConfig, path: string, query: Record<string, string | number | undefined> = {}): Promise<CloudflareEnvelope<T>> {
  if (!path.startsWith("/")) throw new Error("Cloudflare API path must start with /");
  const url = new URL(`${API}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${config.token}`, Accept: "application/json" },
  });
  const payload = (await response.json()) as CloudflareEnvelope<T>;
  if (!response.ok || !payload.success) {
    const message = payload.errors?.map((e) => e.message || e.code).join("; ") || `HTTP ${response.status}`;
    throw new Error(`Cloudflare read failed: ${message}`);
  }
  return payload;
}

export function accountPath(accountId: string, suffix: string): string {
  return `/accounts/${encodeURIComponent(accountId)}${suffix}`;
}
