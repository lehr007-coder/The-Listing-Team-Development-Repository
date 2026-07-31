import crypto from "node:crypto";

// GHL Custom Menu Links encrypt the user payload with CryptoJS AES.encrypt
// (passphrase mode), which produces an OpenSSL-compatible Salted__ blob:
//   "Salted__" (8B) | salt (8B) | ciphertext
// Key + IV are derived via EVP_BytesToKey(MD5, passphrase, salt, 1 iter).
// We replicate that with Node crypto so we don't need crypto-js.
function evpBytesToKey(passphrase: Buffer, salt: Buffer, keyLen: number, ivLen: number) {
  const out: Buffer[] = [];
  let prev = Buffer.alloc(0);
  let total = 0;
  while (total < keyLen + ivLen) {
    prev = crypto.createHash("md5").update(Buffer.concat([prev, passphrase, salt])).digest();
    out.push(prev);
    total += prev.length;
  }
  const merged = Buffer.concat(out);
  return { key: merged.subarray(0, keyLen), iv: merged.subarray(keyLen, keyLen + ivLen) };
}

export type GhlSsoPayload = {
  userId: string;
  companyId?: string;
  locationId?: string;
  activeLocation?: string; // GHL sends the location here for location-context SSO
  type?: string;     // "agency" | "location"
  role?: string;     // GHL role string (e.g. "admin", "user")
  userName?: string;
  email?: string;
};

// GHL's SSO payload carries the location as `activeLocation` (location
// context) or occasionally `locationId`. Normalize to one accessor.
export function ssoLocationId(payload: GhlSsoPayload): string {
  return payload.locationId || payload.activeLocation || "";
}

export function decryptGhlSso(encrypted: string, ssoKey: string): GhlSsoPayload {
  const blob = Buffer.from(encrypted, "base64");
  if (blob.subarray(0, 8).toString() !== "Salted__") {
    throw new Error("Invalid SSO payload: missing OpenSSL header");
  }
  const salt = blob.subarray(8, 16);
  const ciphertext = blob.subarray(16);
  const { key, iv } = evpBytesToKey(Buffer.from(ssoKey, "utf8"), salt, 32, 16);
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  return JSON.parse(plain);
}

// GHL ships a handful of role strings; collapse them to our two app roles.
export function mapGhlRole(payload: GhlSsoPayload): "admin" | "agent" {
  const r = (payload.role || payload.type || "").toLowerCase();
  if (r === "admin" || r === "agency" || r === "owner") return "admin";
  return "agent";
}
