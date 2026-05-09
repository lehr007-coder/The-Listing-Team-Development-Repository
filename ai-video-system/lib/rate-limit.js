// Cost-guardrail rate limits.
//
// Two layered caps, both reset daily (UTC). Backed by KV with ~26h TTL
// so yesterday's bucket auto-expires.
//
//   • global daily limit  — protects total spend
//   • per-contact daily   — protects against a single misconfigured
//                            workflow looping on one record
//
// Defaults can be overridden by env vars:
//   DAILY_RENDER_LIMIT          (global, default 100)
//   PER_CONTACT_DAILY_LIMIT     (per contact, default 3)
//
// Both limits are soft (KV is eventually consistent + non-atomic) so a
// burst of simultaneous requests can sneak 1-2 over. Good enough as a
// runaway-protection mechanism; it's not a billing-grade quota.

const DEFAULT_DAILY = 100;
const DEFAULT_PER_CONTACT = 3;
const DAY_TTL = 60 * 60 * 26; // 26 hours so today's bucket survives midnight UTC

function todayUtc() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function limits(env) {
  return {
    global: parseInt(env.DAILY_RENDER_LIMIT || DEFAULT_DAILY, 10) || DEFAULT_DAILY,
    perContact: parseInt(env.PER_CONTACT_DAILY_LIMIT || DEFAULT_PER_CONTACT, 10) || DEFAULT_PER_CONTACT,
  };
}

async function getCount(env, key) {
  const v = await env.VIDEO_KV.get(key);
  return parseInt(v || "0", 10) || 0;
}

export async function checkRateLimit(env, contactId) {
  if (!env.VIDEO_KV) return { allowed: true, skipped: "no_kv" };
  const day = todayUtc();
  const { global, perContact } = limits(env);

  const globalKey  = `rl:global:${day}`;
  const contactKey = contactId ? `rl:contact:${contactId}:${day}` : null;

  const [globalCount, contactCount] = await Promise.all([
    getCount(env, globalKey),
    contactKey ? getCount(env, contactKey) : Promise.resolve(0),
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
  return {
    allowed: true,
    global_count: globalCount,
    global_limit: global,
    contact_count: contactCount,
    contact_limit: perContact,
    day,
  };
}

export async function incrementRateLimit(env, contactId) {
  if (!env.VIDEO_KV) return;
  const day = todayUtc();
  const globalKey  = `rl:global:${day}`;
  const contactKey = contactId ? `rl:contact:${contactId}:${day}` : null;

  const [g, c] = await Promise.all([
    getCount(env, globalKey),
    contactKey ? getCount(env, contactKey) : Promise.resolve(0),
  ]);

  const writes = [
    env.VIDEO_KV.put(globalKey, String(g + 1), { expirationTtl: DAY_TTL }),
  ];
  if (contactKey) {
    writes.push(env.VIDEO_KV.put(contactKey, String(c + 1), { expirationTtl: DAY_TTL }));
  }
  await Promise.all(writes);
}

export async function rateLimitState(env) {
  if (!env.VIDEO_KV) return { skipped: "no_kv" };
  const day = todayUtc();
  const { global, perContact } = limits(env);
  const globalCount = await getCount(env, `rl:global:${day}`);

  // List per-contact counters from today
  const list = await env.VIDEO_KV.list({ prefix: `rl:contact:`, limit: 1000 });
  const perContactToday = list.keys
    .filter(k => k.name.endsWith(`:${day}`))
    .map(k => k.name.replace(/^rl:contact:/, "").replace(`:${day}`, ""));

  return {
    day,
    global: { count: globalCount, limit: global, remaining: Math.max(0, global - globalCount) },
    per_contact: { limit: perContact, contacts_today: perContactToday.length },
  };
}
