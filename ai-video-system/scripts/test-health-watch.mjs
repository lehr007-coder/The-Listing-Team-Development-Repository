// Tests runHealthWatch decision logic with a fake KV and a stubbed HeyGen.
// Verifies it alerts on the right conditions, stays silent on the wrong ones,
// self-rate-limits, and never throws.

import { runHealthWatch } from "/Users/scott/.cache/tlt/tlt-dev/ai-video-system/lib/health-watch.js";

function fakeKV() {
  const m = new Map();
  return {
    store: m,
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async put(k, v) { m.set(k, v); },
    async delete(k) { m.delete(k); },
  };
}

const sent = [];
globalThis.fetch = async (url, init) => {
  const u = String(url);
  // HeyGen quota probe
  if (u.includes("remaining_quota") || u.includes("user.get")) {
    return new Response(JSON.stringify({ data: { remaining_quota: globalThis.__quota } }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }
  // GHL send
  sent.push({ url: u, body: init?.body ? String(init.body).slice(0, 200) : null });
  return new Response(JSON.stringify({ ok: true, id: "msg_1" }), {
    status: 200, headers: { "content-type": "application/json" },
  });
};

function baseEnv(kv) {
  return {
    ENVIRONMENT: "test", VIDEO_KV: kv, VIDEO_DB: {},
    SUPABASE_URL: "https://x.supabase.co", SUPABASE_KEY: "k",
    HEYGEN_API_KEY: "k", PROXY_API_KEY: "k", BASE_URL: "https://x",
    GHL_V2_TOKEN: "t", GHL_LOCATION_ID: "loc",
    WEEKLY_REPORT_CONTACT_IDS: "contact_a",
  };
}

const fails = [];
const check = (name, cond, detail = "") => { if (!cond) fails.push(`${name}${detail ? " — " + detail : ""}`); };

// 1. Healthy: plenty of credit, full config -> no alerts
{
  const kv = fakeKV(); globalThis.__quota = 500; sent.length = 0;
  const r = await runHealthWatch(baseEnv(kv));
  check("healthy: no alerts", (r.alerts || []).filter(a => a.sent).length === 0, JSON.stringify(r.alerts));
  check("healthy: no email", sent.length === 0);
}

// 2. Credit exhausted -> alerts
{
  const kv = fakeKV(); globalThis.__quota = 0; sent.length = 0;
  const r = await runHealthWatch(baseEnv(kv));
  const a = (r.alerts || []).find(x => x.kind === "credit-zero");
  check("zero credit alerts", !!a && a.sent, JSON.stringify(r.alerts));
  check("zero credit emails once", sent.length === 1, `sent=${sent.length}`);
}

// 3. Low credit -> alerts
{
  const kv = fakeKV(); globalThis.__quota = 3; sent.length = 0;
  const r = await runHealthWatch(baseEnv(kv));
  const a = (r.alerts || []).find(x => x.kind === "credit-low");
  check("low credit (3) alerts", !!a && a.sent, JSON.stringify(r.alerts));
}

// 4. Rate limit: hourly sweep marker blocks the second run
{
  const kv = fakeKV(); globalThis.__quota = 0; sent.length = 0;
  await runHealthWatch(baseEnv(kv));
  const before = sent.length;
  const r2 = await runHealthWatch(baseEnv(kv));
  check("second run within the hour is skipped", r2.skipped === "swept_recently", JSON.stringify(r2));
  check("no extra email on skip", sent.length === before);
}

// 5. Daily dedupe: clear the sweep marker, same condition must not re-email
{
  const kv = fakeKV(); globalThis.__quota = 0; sent.length = 0;
  await runHealthWatch(baseEnv(kv));
  const after1 = sent.length;
  await kv.delete("watch:last-sweep");           // pretend an hour passed
  const r2 = await runHealthWatch(baseEnv(kv));
  const a = (r2.alerts || []).find(x => x.kind === "credit-zero");
  check("same condition deduped for 24h", a && !a.sent && a.reason === "already_alerted_today", JSON.stringify(a));
  check("no second email", sent.length === after1, `sent=${sent.length}`);
}

// 6. Missing config -> alerts (the 5-week-outage signature)
{
  const kv = fakeKV(); globalThis.__quota = 500; sent.length = 0;
  const env = baseEnv(kv); delete env.SUPABASE_URL;
  const r = await runHealthWatch(env);
  const a = (r.alerts || []).find(x => x.kind === "config-missing");
  check("missing SUPABASE_URL alerts", !!a && a.sent, JSON.stringify(r.alerts));
  check("names the missing key", (r.missing_config || []).includes("SUPABASE_URL"));
}

// 7. Unreadable balance must NOT alert (alerting on unknown trains people to ignore it)
{
  const kv = fakeKV(); sent.length = 0;
  const prev = globalThis.fetch;
  globalThis.fetch = async (u, i) => {
    if (String(u).includes("quota") || String(u).includes("user.get")) return new Response("nope", { status: 500 });
    sent.push({ url: String(u) });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const r = await runHealthWatch(baseEnv(kv));
  check("unreadable credit does not alert", !(r.alerts || []).some(a => String(a.kind).startsWith("credit") && a.sent), JSON.stringify(r.alerts));
  check("unreadable credit sends no email", sent.length === 0);
  globalThis.fetch = prev;
}

// 8. Must never throw, even with a hostile env
{
  let threw = false;
  try { await runHealthWatch({}); } catch { threw = true; }
  check("no KV: does not throw", !threw);
  let threw2 = false;
  try {
    const kv = fakeKV();
    await runHealthWatch({ VIDEO_KV: kv, get ENVIRONMENT() { throw new Error("boom"); } });
  } catch { threw2 = true; }
  check("hostile env: does not throw", !threw2);
}

console.log(fails.length ? `FAIL (${fails.length}):\n` + fails.join("\n")
  : "PASS - 8/8: alerts on zero/low credit and missing config, silent when healthy or unreadable, rate-limited hourly, deduped daily, never throws");
process.exit(fails.length ? 1 : 0);
