// Cost-guardrail rate limits.
//
// Three layered caps, all reset daily (UTC). Backed by KV with ~26h TTL
// so yesterday's bucket auto-expires.
//
//   • global daily limit    — protects total HeyGen spend
//   • per-contact daily     — protects against a single misconfigured
//                              workflow looping on one record
//   • per-location daily    — caps video volume per GHL sub-account so
//                              one location can't crowd out others in a
//                              multi-location deployment
//
// Defaults can be overridden by env vars:
//   DAILY_RENDER_LIMIT          (global, default 100)
//   PER_CONTACT_DAILY_LIMIT     (per contact, default 3)
//   PER_LOCATION_DAILY_LIMIT    (per location, default 50)
//
// All limits are soft (KV is eventually consistent + non-atomic) so a
// burst of simultaneous requests can sneak 1-2 over. Good enough as a
// runaway-protection mechanism; it's not a billing-grade quota.

const DEFAULT_DAILY = 100;
const DEFAULT_PER_CONTACT = 3;
const DEFAULT_PER_LOCATION = 50;
const DAY_TTL = 60 * 60 * 26; // 26 hours so today's bucket survives midnight UTC

function todayUtc() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function limits(env) {
  return {
    global:      parseInt(env.DAILY_RENDER_LIMIT       || DEFAULT_DAILY,        10) || DEFAULT_DAILY,
    perContact:  parseInt(env.PER_CONTACT_DAILY_LIMIT  || DEFAULT_PER_CONTACT,  10) || DEFAULT_PER_CONTACT,
    perLocation: parseInt(env.PER_LOCATION_DAILY_LIMIT || DEFAULT_PER_LOCATION, 10) || DEFAULT_PER_LOCATION,
  };
}

async function getCount(env, key) {
  const v = await env.VIDEO_KV.get(key);
  return parseInt(v || "0", 10) || 0;
}

export async function checkRateLimit(env, contactId, locationId) {
  if (!env.VIDEO_KV) return { allowed: true, skipped: "no_kv" };
  const day = todayUtc();
  const { global, perContact, perLocation } = limits(env);

  const globalKey   = `rl:global:${day}`;
  const contactKey  = contactId  ? `rl:contact:${contactId}:${day}`   : null;
  const locationKey = locationId ? `rl:location:${locationId}:${day}` : null;

  const [globalCount, contactCount, locationCount] = await Promise.all([
    getCount(env, globalKey),
    contactKey  ? getCount(env, contactKey)  : Promise.resolve(0),
    locationKey ? getCount(env, locationKey) : Promise.resolve(0),
  ]);

  if (globalCount >= global) {
    return {
      allowed: false,
      reason: "global_daily_limit_exceeded",
      count: globalCount,
      limit: global,
      day,
    };
  }
  if (contactKey && contactCount >= perContact) {
    return {
      allowed: false,
      reason: "per_contact_daily_limit_exceeded",
      contact_id: contactId,
      count: contactCount,
      limit: perContact,
      day,
    };
  }
  if (locationKey && locationCount >= perLocation) {
    return {
      allowed: false,
      reason: "per_location_daily_limit_exceeded",
      location_id: locationId,
      count: locationCount,
      limit: perLocation,
      day,
    };
  }
  return {
    allowed: true,
    global_count: globalCount,
    global_limit: global,
    contact_count: contactCount,
    contact_limit: perContact,
    location_count: locationCount,
    location_limit: perLocation,
    day,
  };
}

export async function incrementRateLimit(env, contactId, locationId) {
  if (!env.VIDEO_KV) return;
  const day = todayUtc();
  const globalKey   = `rl:global:${day}`;
  const contactKey  = contactId  ? `rl:contact:${contactId}:${day}`   : null;
  const locationKey = locationId ? `rl:location:${locationId}:${day}` : null;

  const [g, c, l] = await Promise.all([
    getCount(env, globalKey),
    contactKey  ? getCount(env, contactKey)  : Promise.resolve(0),
    locationKey ? getCount(env, locationKey) : Promise.resolve(0),
  ]);

  const writes = [
    env.VIDEO_KV.put(globalKey, String(g + 1), { expirationTtl: DAY_TTL }),
  ];
  if (contactKey)  writes.push(env.VIDEO_KV.put(contactKey,  String(c + 1), { expirationTtl: DAY_TTL }));
  if (locationKey) writes.push(env.VIDEO_KV.put(locationKey, String(l + 1), { expirationTtl: DAY_TTL }));
  await Promise.all(writes);
}

export async function rateLimitState(env) {
  if (!env.VIDEO_KV) return { skipped: "no_kv" };
  const day = todayUtc();
  const { global, perContact, perLocation } = limits(env);
  const globalCount = await getCount(env, `rl:global:${day}`);

  const list = await env.VIDEO_KV.list({ prefix: `rl:contact:`, limit: 1000 });
  const perContactToday = list.keys
    .filter(k => k.name.endsWith(`:${day}`))
    .map(k => k.name.replace(/^rl:contact:/, "").replace(`:${day}`, ""));

  const locList = await env.VIDEO_KV.list({ prefix: `rl:location:`, limit: 1000 });
  const perLocationToday = locList.keys
    .filter(k => k.name.endsWith(`:${day}`))
    .map(k => ({ id: k.name.replace(/^rl:location:/, "").replace(`:${day}`, "") }));

  return {
    day,
    global:      { count: globalCount, limit: global,      remaining: Math.max(0, global - globalCount) },
    per_contact: { limit: perContact,  contacts_today: perContactToday.length },
    per_location: { limit: perLocation, locations_today: perLocationToday.length },
  };
}
