// Admin dashboard — single-page UI on /admin.
//
// Surfaces all the JSON-only admin endpoints in one place:
//   • Recent jobs with status / engagement score
//   • Kill-switch state with toggle
//   • Rate-limit usage today
//   • Per-job tracking detail on click
//   • Per-contact video history
//
// Auth: prompts for PROXY_API_KEY on first visit, stores in localStorage.
// No backend session — every request goes through the JSON endpoints
// with the X-API-Key header. Works on any browser without builds.

import { error } from "../lib/util.js";

export default async function dashboardRoute(request, env, ctx, url) {
  if (request.method !== "GET") return error(405, "method_not_allowed");
  return new Response(DASHBOARD_HTML, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>AI Video — Admin</title>
<style>
  :root { color-scheme: dark; --bg:#0a0a0a; --panel:#141414; --line:#222; --fg:#eaeaea; --muted:#888; --ok:#26c281; --warn:#f5a623; --bad:#e74c3c; --accent:#ff6a00; }
  body { margin:0; background:var(--bg); color:var(--fg); font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif; font-size:14px; }
  header { padding:14px 20px; border-bottom:1px solid var(--line); display:flex; align-items:center; gap:16px; }
  header h1 { margin:0; font-size:16px; font-weight:600; }
  header .env { font-size:11px; color:var(--muted); }
  header .build { font-size:11px; color:var(--muted); margin-left:auto; }
  main { padding:20px; max-width:1200px; margin:0 auto; }
  .row { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:20px; }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:14px; }
  .card .label { color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.06em; margin-bottom:6px; }
  .card .value { font-size:22px; font-weight:600; }
  .card.bad .value { color:var(--bad); }
  .card.warn .value { color:var(--warn); }
  .card.ok .value { color:var(--ok); }
  .panel { background:var(--panel); border:1px solid var(--line); border-radius:8px; margin-bottom:20px; }
  .panel h2 { margin:0; padding:12px 16px; border-bottom:1px solid var(--line); font-size:13px; font-weight:600; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); }
  table { width:100%; border-collapse:collapse; }
  th, td { padding:10px 16px; text-align:left; border-bottom:1px solid var(--line); font-size:13px; }
  th { color:var(--muted); font-weight:500; font-size:11px; text-transform:uppercase; letter-spacing:.06em; }
  tr:last-child td { border-bottom:none; }
  td.status { font-weight:600; }
  td.status.delivered { color:var(--ok); }
  td.status.rendered  { color:var(--accent); }
  td.status.rendering { color:var(--warn); }
  td.status.failed    { color:var(--bad); }
  td a { color:var(--accent); text-decoration:none; }
  td a:hover { text-decoration:underline; }
  td.engagement { text-align:right; font-variant-numeric:tabular-nums; }
  .actions { display:flex; gap:8px; margin:0 16px 12px; padding-top:8px; }
  button { background:var(--accent); color:#000; border:0; border-radius:6px; padding:8px 14px; font-size:13px; font-weight:600; cursor:pointer; }
  button.ghost { background:transparent; color:var(--fg); border:1px solid var(--line); }
  button.danger { background:var(--bad); color:#fff; }
  button:disabled { opacity:.4; cursor:not-allowed; }
  pre { margin:0; padding:14px 16px; font-size:11px; line-height:1.5; max-height:320px; overflow:auto; background:#000; }
  .muted { color:var(--muted); }
  .pill { display:inline-block; padding:2px 8px; border-radius:999px; font-size:10px; font-weight:600; }
  .pill.on  { background:#3a1c1c; color:var(--bad); }
  .pill.off { background:#1c3a25; color:var(--ok); }
  input[type=text] { background:var(--bg); color:var(--fg); border:1px solid var(--line); border-radius:6px; padding:6px 10px; font-size:13px; min-width:280px; }
  details { padding:0 16px 12px; }
  details summary { cursor:pointer; padding:8px 0; color:var(--muted); }
  .empty { padding:24px 16px; color:var(--muted); text-align:center; }
  .ctr-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; padding:14px 16px; }
  .ctr-cell { background:#000; border:1px solid var(--line); border-radius:6px; padding:10px 12px; }
  .ctr-cell .ch { color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.06em; }
  .ctr-cell .pct { font-size:24px; font-weight:600; margin:4px 0; }
  .ctr-cell .pct.high { color:var(--ok); }
  .ctr-cell .pct.zero { color:var(--muted); }
  .ctr-cell .ratio { color:var(--muted); font-size:11px; }
  .funnel { display:flex; gap:6px; padding:0 16px 14px; }
  .funnel-bar { flex:1; background:#000; border:1px solid var(--line); border-radius:6px; padding:8px 10px; text-align:center; }
  .funnel-bar .pct { color:var(--muted); font-size:11px; }
  .funnel-bar .count { font-size:20px; font-weight:600; }
  .funnel-bar .bar { height:4px; background:var(--accent); margin-top:6px; border-radius:2px; transition:width .3s; }
</style>
</head>
<body>
<header>
  <h1>AI Video — Admin</h1>
  <span class="env" id="env"></span>
  <span class="build" id="build"></span>
</header>
<main>
  <div class="row">
    <div class="card" id="card-jobs"><div class="label">Jobs total</div><div class="value">…</div></div>
    <div class="card" id="card-delivered"><div class="label">Delivered</div><div class="value">…</div></div>
    <div class="card" id="card-rendering"><div class="label">In flight</div><div class="value">…</div></div>
    <div class="card" id="card-failed"><div class="label">Failed</div><div class="value">…</div></div>
  </div>

  <div class="row">
    <div class="card" id="card-rl-global"><div class="label">Renders today (global)</div><div class="value">…</div></div>
    <div class="card" id="card-rl-contacts"><div class="label">Contacts today</div><div class="value">…</div></div>
    <div class="card" id="card-killswitch"><div class="label">Kill switch</div><div class="value">…</div></div>
    <div class="card" id="card-uptime"><div class="label">Last health</div><div class="value">…</div></div>
  </div>

  <div class="panel" id="ctr-panel">
    <h2>24-hour summary · CTR by channel</h2>
    <div id="ctr-body" class="empty">Loading…</div>
    <div id="watch-funnel"></div>
  </div>

  <div class="panel">
    <h2>Top contacts by engagement</h2>
    <table id="top-contacts-table">
      <thead><tr><th>Contact</th><th>Videos</th><th>Delivered</th><th>Failed</th><th>Engagement</th><th>Last render</th></tr></thead>
      <tbody><tr><td colspan="6" class="empty">Loading…</td></tr></tbody>
    </table>
  </div>

  <div class="panel">
    <h2>Recent jobs</h2>
    <div class="actions">
      <button id="refresh">Refresh</button>
      <button id="kill-toggle" class="ghost">Toggle kill-switch</button>
      <input type="text" id="contact-filter" placeholder="Filter by contact_id…">
    </div>
    <table id="jobs-table">
      <thead><tr><th>Job</th><th>Type</th><th>Engine</th><th>Status</th><th>Aspect</th><th>Engagement</th><th>Created</th><th>Hosted</th></tr></thead>
      <tbody><tr><td colspan="8" class="empty">Loading…</td></tr></tbody>
    </table>
  </div>

  <div class="panel" id="job-detail-panel" style="display:none">
    <h2>Job detail — <span id="job-detail-id"></span></h2>
    <div id="job-detail-summary"></div>
    <details><summary>Full JSON</summary><pre id="job-detail-json"></pre></details>
  </div>
</main>

<script>
(async () => {
  let KEY = localStorage.getItem("ai_video_admin_key") || "";
  if (!KEY) {
    KEY = prompt("Paste your PROXY_API_KEY:");
    if (!KEY) { document.body.innerHTML = "<p style='padding:40px;text-align:center'>No key provided. Reload to retry.</p>"; return; }
    localStorage.setItem("ai_video_admin_key", KEY);
  }

  const api = async (path) => {
    const r = await fetch(path, { headers: { "X-API-Key": KEY }});
    if (r.status === 401) {
      localStorage.removeItem("ai_video_admin_key");
      alert("Invalid key — reload page to re-enter.");
      throw new Error("unauthorized");
    }
    return r.json();
  };

  const apiPost   = (path, body)   => fetch(path, { method:"POST",   headers:{"X-API-Key":KEY,"Content-Type":"application/json"}, body:body?JSON.stringify(body):undefined }).then(r=>r.json());
  const apiDelete = (path)          => fetch(path, { method:"DELETE", headers:{"X-API-Key":KEY}}).then(r=>r.json());

  const set = (id, v, klass) => {
    const el = document.querySelector("#"+id+" .value");
    if (el) el.textContent = v;
    if (klass !== undefined) {
      const card = document.getElementById(id);
      card.className = "card " + klass;
    }
  };

  const fmtDate = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleString();
  };

  const truncId = (s) => (s || "").length > 24 ? s.slice(0, 22) + "…" : s;

  async function loadHealth() {
    const h = await api("/v1/admin/health-deep");
    document.getElementById("env").textContent   = (h.env || "?") + " · build:" + (h.build || "—");
    document.getElementById("build").textContent = "Last check " + new Date().toLocaleTimeString();
    const counts = h.counters?.video_jobs_by_status || {};
    set("card-jobs",       h.counters?.video_jobs_total ?? "—");
    set("card-delivered",  counts.delivered ?? 0, "ok");
    set("card-rendering",  counts.rendering ?? 0, (counts.rendering > 5 ? "warn" : ""));
    set("card-failed",     counts.failed ?? 0, (counts.failed > 0 ? "bad" : ""));
    const ks = h.kill_switch || {};
    set("card-killswitch", ks.killed ? "ACTIVE" : "off", ks.killed ? "bad" : "ok");
    document.getElementById("kill-toggle").textContent = ks.killed ? "Resume (clear kill-switch)" : "Pause (activate kill-switch)";
  }

  async function loadRateLimits() {
    const rl = await api("/v1/admin/rate-limits");
    if (rl.skipped) {
      set("card-rl-global", "—");
      set("card-rl-contacts", "—");
      return;
    }
    const g = rl.global || {};
    const used = g.count ?? 0;
    const limit = g.limit ?? 0;
    set("card-rl-global", used + " / " + limit, used >= limit ? "bad" : (used > limit*0.8 ? "warn" : ""));
    set("card-rl-contacts", (rl.per_contact?.contacts_today ?? 0) + " contacts");
    set("card-uptime", "OK", "ok");
  }

  async function loadJobs(filter) {
    const url = filter
      ? "/v1/admin/jobs?limit=50&contact_id=" + encodeURIComponent(filter)
      : "/v1/admin/jobs?limit=50";
    const r = await api(url);
    const tbody = document.querySelector("#jobs-table tbody");
    if (!r.jobs || r.jobs.length === 0) {
      tbody.innerHTML = "<tr><td colspan='8' class='empty'>No jobs.</td></tr>";
      return;
    }
    tbody.innerHTML = r.jobs.map(j => \`
      <tr data-id="\${j.id}" style="cursor:pointer">
        <td><a href="#" data-id="\${j.id}">\${truncId(j.id)}</a></td>
        <td>\${j.video_type || "—"}</td>
        <td>\${j.render_engine || "—"}</td>
        <td class="status \${j.status}">\${j.status}</td>
        <td>\${j.aspect || "—"}</td>
        <td class="engagement">\${j.engagement_score ?? 0}</td>
        <td>\${fmtDate(j.created_at)}</td>
        <td>\${j.hosted_url ? \`<a href="\${j.hosted_url}" target="_blank">view</a>\` : "—"}</td>
      </tr>
    \`).join("");
    tbody.querySelectorAll("tr").forEach(tr => {
      tr.addEventListener("click", () => loadJobDetail(tr.dataset.id));
    });
  }

  async function loadJobDetail(jobId) {
    const [job, tracking] = await Promise.all([
      api("/v1/admin/jobs/" + jobId),
      api("/v1/admin/jobs/" + jobId + "/tracking"),
    ]);
    document.getElementById("job-detail-panel").style.display = "block";
    document.getElementById("job-detail-id").textContent = jobId;
    const s = tracking.summary || {};
    document.getElementById("job-detail-summary").innerHTML = \`
      <div style="padding:12px 16px;display:grid;grid-template-columns:repeat(4,1fr);gap:8px 24px">
        <div><span class="muted">Opens:</span> <strong>\${s.opens ?? 0}</strong></div>
        <div><span class="muted">Clicks:</span> <strong>\${s.clicks ?? 0}</strong></div>
        <div><span class="muted">CTA clicks:</span> <strong>\${s.cta_clicks ?? 0}</strong></div>
        <div><span class="muted">Watch %:</span> <strong>\${s.max_watch_pct ?? 0}%</strong></div>
        <div><span class="muted">Email sent:</span> <strong>\${s.sent?.email ?? 0}</strong></div>
        <div><span class="muted">SMS sent:</span> <strong>\${s.sent?.sms ?? 0}</strong></div>
        <div><span class="muted">Notes appended:</span> <strong>\${s.ghl_notes_appended ?? 0}</strong></div>
        <div><span class="muted">Engagement:</span> <strong>\${s.engagement_score ?? 0}</strong></div>
      </div>\`;
    document.getElementById("job-detail-json").textContent = JSON.stringify(job, null, 2);
    document.getElementById("job-detail-panel").scrollIntoView({behavior:"smooth"});
  }

  async function loadDailySummary() {
    const s = await api("/v1/admin/daily-summary?days=1");
    const ctr = s.ctr_by_channel || {};
    const ctrEl = document.getElementById("ctr-body");
    ctrEl.classList.remove("empty");
    ctrEl.innerHTML = \`<div class="ctr-grid">\${
      ["email","sms","conversation"].map(ch => {
        const c = ctr[ch] || { sent:0, clicks:0, ctr_pct:null };
        const pct = c.ctr_pct == null ? "—" : c.ctr_pct + "%";
        const klass = c.ctr_pct == null || c.ctr_pct === 0 ? "zero" : (c.ctr_pct >= 20 ? "high" : "");
        return \`<div class="ctr-cell">
                  <div class="ch">\${ch}</div>
                  <div class="pct \${klass}">\${pct}</div>
                  <div class="ratio">\${c.clicks} clicks / \${c.sent} sent</div>
                </div>\`;
      }).join("")
    }</div>\`;

    const wf = s.watch_funnel || {};
    const max = Math.max(wf["25"]||0, wf["50"]||0, wf["75"]||0, wf["100"]||0, 1);
    document.getElementById("watch-funnel").innerHTML = \`
      <div style="padding:0 16px 8px;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.06em">Watch funnel (last 24h)</div>
      <div class="funnel">\${
        [25,50,75,100].map(p => {
          const c = wf[String(p)] || 0;
          const w = Math.round((c / max) * 100);
          return \`<div class="funnel-bar">
                    <div class="pct">\${p}%</div>
                    <div class="count">\${c}</div>
                    <div class="bar" style="width:\${w}%"></div>
                  </div>\`;
        }).join("")
      }</div>\`;
  }

  async function loadTopContacts() {
    const r = await api("/v1/admin/contacts/top?limit=10");
    const tbody = document.querySelector("#top-contacts-table tbody");
    if (!r.contacts || r.contacts.length === 0) {
      tbody.innerHTML = "<tr><td colspan='6' class='empty'>No contacts yet.</td></tr>";
      return;
    }
    tbody.innerHTML = r.contacts.map(c => \`
      <tr style="cursor:pointer" data-cid="\${c.contact_id}">
        <td><a href="#" data-cid="\${c.contact_id}">\${c.contact_id}</a></td>
        <td>\${c.total_videos}</td>
        <td class="status delivered">\${c.delivered}</td>
        <td class="status failed">\${c.failed}</td>
        <td class="engagement">\${c.total_engagement}</td>
        <td>\${fmtDate(c.last_render_at)}</td>
      </tr>
    \`).join("");
    tbody.querySelectorAll("tr").forEach(tr => {
      tr.addEventListener("click", () => {
        document.getElementById("contact-filter").value = tr.dataset.cid;
        loadJobs(tr.dataset.cid);
      });
    });
  }

  async function refresh() {
    try {
      await Promise.all([
        loadHealth(),
        loadRateLimits(),
        loadDailySummary(),
        loadTopContacts(),
        loadJobs(document.getElementById("contact-filter").value.trim()),
      ]);
    } catch (e) {
      console.error(e);
    }
  }

  document.getElementById("refresh").addEventListener("click", refresh);
  document.getElementById("contact-filter").addEventListener("input", () => {
    clearTimeout(window._filt);
    window._filt = setTimeout(refresh, 300);
  });
  document.getElementById("kill-toggle").addEventListener("click", async () => {
    const cur = await api("/v1/admin/kill");
    if (cur.killed) {
      if (!confirm("Resume the pipeline? New renders will be accepted.")) return;
      await apiDelete("/v1/admin/kill");
    } else {
      const reason = prompt("Reason for pausing? (optional)") || "manual via dashboard";
      await apiPost("/v1/admin/kill", { reason });
    }
    refresh();
  });

  await refresh();
  setInterval(refresh, 30000); // auto-refresh every 30s
})();
</script>
</body>
</html>`;
