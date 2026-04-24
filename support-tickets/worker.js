// The Listing Team - Support Tickets Worker
// Standalone Cloudflare Worker for submitting and managing support tickets.
// Persists to Supabase table: support_tickets

var ALLOWED_ORIGINS = [
  "https://thelistingteamproxy-staging.lehr007.workers.dev",
  "https://thelistingteamproxy.lehr007.workers.dev",
  "https://tlt-support-tickets-staging.lehr007.workers.dev",
  "https://tlt-support-tickets.lehr007.workers.dev",
  "http://localhost:8787",
  "http://127.0.0.1:8787"
];

var CORS_BASE = {
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Support-Admin",
  "Access-Control-Max-Age": "86400"
};

function getCorsOrigin(request) {
  var origin = request && request.headers ? request.headers.get("Origin") || "" : "";
  if (ALLOWED_ORIGINS.indexOf(origin) !== -1) return origin;
  return "*";
}

function corsHeaders(extra, request) {
  extra = extra || {};
  return Object.assign({}, CORS_BASE, {
    "Access-Control-Allow-Origin": getCorsOrigin(request),
    "Content-Type": "application/json"
  }, extra);
}

function json(data, status, request) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: corsHeaders({}, request)
  });
}

// -------------------------------------------------------------------
// Safe error helper — logs full detail, returns generic message.
// Never echoes env values, URLs, or raw fetch errors to the client.
// -------------------------------------------------------------------
function safeError(e, context, request) {
  try { console.error("[" + (context || "worker") + "]", e && (e.stack || e.message || e)); } catch (_) {}
  return json({ error: "Internal server error" }, 500, request);
}

// -------------------------------------------------------------------
// GHL Webhook notification
// -------------------------------------------------------------------
async function sendNotification(env, eventType, data) {
  var webhookUrl = env.GHL_NOTIFY_WEBHOOK || "";
  if (!webhookUrl) return;
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: eventType,
        timestamp: new Date().toISOString(),
        source: "tlt-support-tickets",
        ...data
      })
    });
  } catch (e) { /* best-effort */ }
}

// -------------------------------------------------------------------
// SUPPORT_HTML - the public-facing page served at /
// -------------------------------------------------------------------
var SUPPORT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>The Listing Team — Support</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0f172a;color:#f1f5f9;font-family:'Inter',system-ui,sans-serif;font-size:14px;line-height:1.5;min-height:100vh}
a{color:#3b82f6;text-decoration:none}
.hbar{background:linear-gradient(135deg,#0f2137,#1a3a6b,#1e4d9e);padding:14px 24px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;box-shadow:0 2px 16px rgba(0,0,0,0.5)}
.hbar-logo{font-size:15px;font-weight:800;color:#fff;letter-spacing:-0.02em;white-space:nowrap}
.hbar-logo span{color:#60a5fa}
.hnav{display:flex;gap:4px;margin-left:8px;flex-wrap:wrap}
.hnav a{padding:5px 10px;border-radius:6px;font-size:11px;font-weight:600;border:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,0.6);transition:all .15s;text-decoration:none}
.hnav a:hover,.hnav a.active{color:#fff;background:rgba(255,255,255,0.12);border-color:rgba(255,255,255,0.3)}
.hbar-right{margin-left:auto;display:flex;gap:8px;align-items:center}
.hbtn{padding:6px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:#fff;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .15s}
.hbtn:hover{background:rgba(255,255,255,0.15)}
.admin-badge{display:none;align-items:center;gap:5px;padding:5px 10px;border-radius:20px;background:rgba(234,179,8,0.18);color:#eab308;font-size:11px;font-weight:700;border:1px solid rgba(234,179,8,0.3)}
.main{padding:24px;max-width:1100px;margin:0 auto}
.tabs{display:flex;gap:0;border-bottom:1px solid #1e293b;margin-bottom:24px;flex-wrap:wrap}
.tab-btn{padding:10px 20px;font-size:13px;font-weight:600;color:#64748b;background:none;border:none;border-bottom:2px solid transparent;cursor:pointer;font-family:inherit;transition:all .15s;white-space:nowrap}
.tab-btn:hover{color:#94a3b8}
.tab-btn.active{color:#3b82f6;border-bottom-color:#3b82f6}
.tab-content{display:none}
.tab-content.active{display:block}
.form-card{background:#1e293b;border:1px solid #334155;border-radius:14px;padding:28px;max-width:640px}
.form-group{margin-bottom:14px}
.form-group label{display:block;font-size:11px;font-weight:700;color:#64748b;margin-bottom:5px;text-transform:uppercase;letter-spacing:.04em}
.form-input{width:100%;padding:9px 12px;border:1px solid #334155;border-radius:8px;background:#0f172a;color:#f1f5f9;font-family:inherit;font-size:13px;transition:border .15s;outline:none}
.form-input:focus{border-color:#3b82f6}
.form-input::placeholder{color:#334155}
textarea.form-input{resize:vertical;min-height:90px}
.form-row{display:flex;gap:10px}
.form-row>.form-group{flex:1}
.btn-primary{padding:10px 20px;border:none;border-radius:8px;background:#3b82f6;color:#fff;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:all .15s}
.btn-primary:hover{background:#2563eb}
.btn-primary:disabled{opacity:.5;cursor:not-allowed}
.btn-secondary{padding:10px 20px;border:1px solid #334155;border-radius:8px;background:transparent;color:#94a3b8;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:all .15s}
.btn-secondary:hover{border-color:#64748b;color:#e2e8f0}
.btn-danger{padding:9px 16px;border:1px solid rgba(239,68,68,0.3);border-radius:8px;background:rgba(239,68,68,0.1);color:#ef4444;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:all .15s}
.btn-danger:hover{background:rgba(239,68,68,0.2)}
.ticket-list{display:flex;flex-direction:column;gap:10px}
.ticket-row{background:#1e293b;border:1px solid #334155;border-radius:10px;padding:14px 18px;cursor:pointer;transition:all .15s;display:flex;align-items:center;gap:14px}
.ticket-row:hover{border-color:#3b82f6;background:#1e3554}
.ticket-ref{font-size:11px;font-weight:800;color:#60a5fa;font-family:'Courier New',monospace;white-space:nowrap;min-width:90px}
.ticket-info{flex:1;min-width:0}
.ticket-title{font-size:13px;font-weight:600;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ticket-meta{font-size:11px;color:#64748b;margin-top:2px}
.ticket-badges{display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end}
.badge{display:inline-block;padding:3px 8px;border-radius:5px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;white-space:nowrap}
.lookup-card{background:#1e293b;border:1px solid #334155;border-radius:14px;padding:24px;max-width:520px;margin-bottom:24px}
.lookup-row{display:flex;gap:10px}
.admin-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px}
.admin-filters{display:flex;gap:8px;flex-wrap:wrap}
.filter-select{padding:7px 10px;border:1px solid #334155;border-radius:7px;background:#0f172a;color:#94a3b8;font-size:12px;font-family:inherit;outline:none}
.stats-row{display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap}
.stat-chip{padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600;background:#1e293b;border:1px solid #334155;display:flex;align-items:center;gap:6px;white-space:nowrap}
.stat-chip b{font-size:15px;font-weight:800}
.modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:1000;align-items:center;justify-content:center;padding:16px}
.modal-overlay.open{display:flex}
.modal{background:#1e293b;border:1px solid #334155;border-radius:16px;padding:26px;width:100%;max-width:580px;max-height:92vh;overflow-y:auto}
.modal-hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;gap:10px}
.modal-hdr h3{font-size:15px;font-weight:700;line-height:1.4}
.modal-close{background:none;border:none;color:#64748b;font-size:18px;cursor:pointer;line-height:1;padding:2px;flex-shrink:0}
.admin-panel{background:rgba(234,179,8,0.04);border:1px solid rgba(234,179,8,0.15);border-radius:10px;padding:16px;margin-top:16px}
.admin-panel-hdr{font-size:11px;font-weight:700;color:#eab308;text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px}
.detail-meta{font-size:12px;color:#64748b;margin-bottom:5px}
.detail-desc{color:#cbd5e1;line-height:1.7;margin-bottom:14px;white-space:pre-wrap;font-size:13px}
.detail-img{width:100%;max-height:280px;object-fit:contain;border-radius:8px;border:1px solid #334155;margin-bottom:14px;background:#0f172a}
.admin-note-box{background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.2);border-radius:8px;padding:10px 14px;font-size:13px;color:#93c5fd;margin-bottom:12px}
.empty-state{text-align:center;padding:48px 16px;color:#475569}
.empty-state .empty-icon{font-size:40px;margin-bottom:12px}
.empty-state p{font-size:13px}
.setup-box{background:rgba(59,130,246,0.05);border:1px solid rgba(59,130,246,0.2);border-radius:10px;padding:14px;margin-top:14px}
.setup-sql{background:#0a1120;border:1px solid #1e2d42;border-radius:6px;padding:10px;font-family:'Courier New',monospace;font-size:10px;color:#64748b;white-space:pre;overflow-x:auto;margin-top:8px;line-height:1.6;max-height:240px}
.toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%) translateY(10px);padding:10px 22px;border-radius:10px;font-size:13px;font-weight:600;z-index:9000;opacity:0;pointer-events:none;transition:all .3s;white-space:nowrap}
.toast.visible{opacity:1;transform:translateX(-50%) translateY(0)}
.toast.success{background:#22c55e;color:#fff}
.toast.error{background:#ef4444;color:#fff}
.toast.info{background:#3b82f6;color:#fff}
.spinner{width:20px;height:20px;border:2px solid #1e293b;border-top-color:#3b82f6;border-radius:50%;animation:spin .8s linear infinite;display:inline-block}
@keyframes spin{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<div class="hbar">
  <div class="hbar-logo">The Listing Team <span>🎟 Support</span></div>
  <div class="hnav">
    <a href="https://thelistingteamproxy-staging.lehr007.workers.dev/dashboard">🏠 Hub</a>
    <a href="https://thelistingteamproxy-staging.lehr007.workers.dev/dashboard/ylopo-contacts">📋 Contacts</a>
    <a href="https://thelistingteamproxy-staging.lehr007.workers.dev/dashboard/ylopo-analytics">📊 Analytics</a>
    <a href="https://thelistingteamproxy-staging.lehr007.workers.dev/dashboard/pipeline">🚀 Pipeline</a>
    <a href="/" class="active">🎟 Support</a>
  </div>
  <div class="hbar-right">
    <div class="admin-badge" id="adminBadge">⭐ Admin</div>
    <button class="hbtn" id="adminBtn" onclick="openAdminModal()">🔒 Admin</button>
  </div>
</div>

<div class="main">
  <div class="tabs">
    <button class="tab-btn active" onclick="showTab('new',this)">📝 New Ticket</button>
    <button class="tab-btn" onclick="showTab('my',this)">🔍 Track My Ticket</button>
    <button class="tab-btn" id="adminTabBtn" onclick="showTab('admin',this)" style="display:none">🔐 Admin Panel</button>
  </div>

  <div class="tab-content active" id="tab-new">
    <div class="form-card">
      <h2 style="font-size:16px;font-weight:700;margin-bottom:4px">📝 Submit a Support Ticket</h2>
      <p style="font-size:12px;color:#64748b;margin-bottom:20px">Describe your issue and we will get back to you as soon as possible.</p>
      <form id="submitForm" onsubmit="event.preventDefault();submitTicket()">
        <div class="form-group">
          <label>Subject *</label>
          <input type="text" id="newTitle" class="form-input" placeholder="Brief summary of your issue" maxlength="160" required>
        </div>
        <div class="form-group">
          <label>Description *</label>
          <textarea id="newDesc" class="form-input" placeholder="Describe the issue in detail..." required></textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Category</label>
            <select id="newCategory" class="form-input">
              <option value="general">General</option>
              <option value="technical">Technical</option>
              <option value="account">Account</option>
              <option value="billing">Billing</option>
              <option value="feature">Feature Request</option>
              <option value="bug">Bug Report</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div class="form-group">
            <label>Priority</label>
            <select id="newPriority" class="form-input">
              <option value="low">Low</option>
              <option value="medium" selected>Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Your Name *</label>
            <input type="text" id="newName" class="form-input" placeholder="Full name" required>
          </div>
          <div class="form-group">
            <label>Email *</label>
            <input type="email" id="newEmail" class="form-input" placeholder="To track your ticket" required>
          </div>
        </div>
        <div class="form-group">
          <label>Screenshot (optional, max 1MB)</label>
          <input type="file" id="newScreenshot" class="form-input" accept="image/*" onchange="handleScreenshot(this)" style="padding:6px">
          <div id="screenshotPreview"></div>
        </div>
        <div style="display:flex;gap:10px;margin-top:6px">
          <button type="submit" class="btn-primary" id="submitBtn">Submit Ticket</button>
          <button type="button" class="btn-secondary" onclick="resetForm()">Clear</button>
        </div>
      </form>
    </div>
  </div>

  <div class="tab-content" id="tab-my">
    <div class="lookup-card">
      <h3 style="font-size:14px;font-weight:700;margin-bottom:4px">🔍 Find My Tickets</h3>
      <p style="font-size:12px;color:#64748b;margin-bottom:16px">Look up by email or ticket reference number.</p>
      <div class="form-group">
        <label>Email Address</label>
        <div class="lookup-row">
          <input type="email" id="lookupEmail" class="form-input" placeholder="your@email.com" onkeydown="if(event.key==='Enter')lookupByEmail()">
          <button class="btn-primary" onclick="lookupByEmail()">Search</button>
        </div>
      </div>
      <div style="margin:12px 0;text-align:center;color:#475569;font-size:12px">— or —</div>
      <div class="form-group">
        <label>Ticket Reference</label>
        <div class="lookup-row">
          <input type="text" id="lookupRef" class="form-input" placeholder="TLT-XXXXXX" onkeydown="if(event.key==='Enter')lookupByRef()">
          <button class="btn-primary" onclick="lookupByRef()">Look Up</button>
        </div>
      </div>
    </div>
    <div id="lookupResults"></div>
  </div>

  <div class="tab-content" id="tab-admin">
    <div class="stats-row" id="adminStats"></div>
    <div class="admin-header">
      <h3 style="font-size:15px;font-weight:700">All Tickets</h3>
      <div class="admin-filters">
        <select class="filter-select" id="filterStatus" onchange="applyFilters()">
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="in-progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
        <select class="filter-select" id="filterPriority" onchange="applyFilters()">
          <option value="">All Priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select class="filter-select" id="filterCategory" onchange="applyFilters()">
          <option value="">All Categories</option>
          <option value="general">General</option>
          <option value="technical">Technical</option>
          <option value="account">Account</option>
          <option value="billing">Billing</option>
          <option value="feature">Feature</option>
          <option value="bug">Bug</option>
          <option value="other">Other</option>
        </select>
      </div>
    </div>
    <div id="adminTicketList"></div>
  </div>
</div>

<div class="modal-overlay" id="ticketModal" onclick="if(event.target===this)closeTicket()">
  <div class="modal">
    <div class="modal-hdr">
      <div>
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#64748b;margin-bottom:4px">Ticket Detail</div>
        <h3 id="modalRef" style="font-size:13px;color:#60a5fa;font-family:'Courier New',monospace;font-weight:800"></h3>
      </div>
      <button class="modal-close" onclick="closeTicket()">✕</button>
    </div>
    <div id="ticketContent"></div>
  </div>
</div>

<div class="modal-overlay" id="adminModal" onclick="if(event.target===this)closeAdminModal()">
  <div class="modal" style="max-width:400px;text-align:center">
    <div class="modal-hdr" style="justify-content:center">
      <h3>🔒 Admin Access</h3>
    </div>
    <p style="color:#64748b;font-size:13px;margin-bottom:18px">Enter admin password to manage all support tickets.</p>
    <div class="form-group">
      <input type="password" id="adminPassword" class="form-input" placeholder="Admin password" style="text-align:center" onkeydown="if(event.key===&#39;Enter&#39;)adminUnlock()">
    </div>
    <div style="display:flex;gap:10px;margin-top:4px">
      <button class="btn-primary" style="flex:1" onclick="adminUnlock()">Unlock</button>
      <button class="btn-secondary" style="flex:1" onclick="closeAdminModal()">Cancel</button>
    </div>
    <div class="setup-box" id="setupBox" style="display:none;text-align:left;margin-top:16px">
      <div style="font-size:12px;font-weight:700;color:#60a5fa;margin-bottom:6px">⚡ First-time Supabase Setup</div>
      <p style="font-size:11px;color:#94a3b8;margin-bottom:6px">Run this SQL in your Supabase SQL editor to create the support_tickets table:</p>
      <div class="setup-sql" id="setupSql"></div>
    </div>
  </div>
</div>

<div class="modal-overlay" id="successModal" onclick="if(event.target===this)closeSuccess()">
  <div class="modal" style="max-width:440px;text-align:center">
    <div style="font-size:48px;margin-bottom:16px">🎉</div>
    <h3 style="font-size:18px;font-weight:800;margin-bottom:8px">Ticket Submitted!</h3>
    <p style="color:#94a3b8;font-size:13px;margin-bottom:16px">Your support ticket has been received. Save your reference number to check status later.</p>
    <div style="background:#0f172a;border:1px solid #334155;border-radius:10px;padding:16px;margin-bottom:20px">
      <div style="font-size:11px;color:#64748b;margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em">Your Ticket Reference</div>
      <div id="successRef" style="font-size:24px;font-weight:800;color:#60a5fa;font-family:'Courier New',monospace"></div>
    </div>
    <p style="font-size:12px;color:#475569;margin-bottom:20px">We will contact you at the email you provided. Average response time: 24–48 hours.</p>
    <button class="btn-primary" onclick="closeSuccess()">Done</button>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
var SUPP_API = '/api/tickets';
var SUPP_ADMIN = 'TeamListing2027!';
var SUPP_SESSION = 'tlt_supp_admin';
var isAdmin = false;
var allTickets = [];
var filteredTickets = [];
var ticketCache = {};
var currentTicket = null;
var screenshotData = null;

var STATUSES = [
  {key:'open',        label:'Open',        color:'#ef4444'},
  {key:'in-progress', label:'In Progress', color:'#f97316'},
  {key:'resolved',    label:'Resolved',    color:'#22c55e'},
  {key:'closed',      label:'Closed',      color:'#64748b'}
];
var PRIS = [
  {key:'urgent', label:'Urgent', color:'#ef4444'},
  {key:'high',   label:'High',   color:'#f97316'},
  {key:'medium', label:'Medium', color:'#eab308'},
  {key:'low',    label:'Low',    color:'#22c55e'}
];
var CAT_LABELS = {general:'General',technical:'Technical',account:'Account',billing:'Billing',feature:'Feature Request',bug:'Bug Report',other:'Other'};

var SETUP_SQL = "CREATE TABLE IF NOT EXISTS support_tickets (" +
  "\\n  id UUID DEFAULT gen_random_uuid() PRIMARY KEY," +
  "\\n  ticket_ref TEXT UNIQUE NOT NULL," +
  "\\n  title TEXT NOT NULL," +
  "\\n  description TEXT," +
  "\\n  category TEXT DEFAULT 'general'," +
  "\\n  priority TEXT DEFAULT 'medium'," +
  "\\n  status TEXT DEFAULT 'open'," +
  "\\n  submitter_name TEXT DEFAULT 'Anonymous'," +
  "\\n  submitter_email TEXT," +
  "\\n  screenshot_data TEXT," +
  "\\n  admin_notes TEXT," +
  "\\n  created_at TIMESTAMPTZ DEFAULT NOW()," +
  "\\n  updated_at TIMESTAMPTZ DEFAULT NOW()" +
  "\\n);" +
  "\\nCREATE INDEX IF NOT EXISTS idx_support_email ON support_tickets(submitter_email);" +
  "\\nCREATE INDEX IF NOT EXISTS idx_support_ref ON support_tickets(ticket_ref);" +
  "\\nALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;" +
  '\\nCREATE POLICY "allow_all" ON support_tickets FOR ALL USING (true) WITH CHECK (true);';

function g(id){return document.getElementById(id);}
function esc(s){if(!s&&s!==0)return '';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function rgba(hex,a){if(!hex||hex.length<7)return 'rgba(100,116,139,'+a+')';var r=parseInt(hex.slice(1,3),16),gr=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return 'rgba('+r+','+gr+','+b+','+a+')';}
function showToast(msg,type){var t=g('toast');if(!t)return;t.textContent=msg;t.className='toast visible '+(type||'success');clearTimeout(t._t);t._t=setTimeout(function(){t.className='toast';},3200);}
function fmtDate(s){if(!s)return '';var d=new Date(s);return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})+' '+d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});}
function getStatus(key){for(var i=0;i<STATUSES.length;i++){if(STATUSES[i].key===key)return STATUSES[i];}return STATUSES[0];}
function getPri(key){for(var i=0;i<PRIS.length;i++){if(PRIS[i].key===key)return PRIS[i];}return PRIS[2];}
function cacheTickets(list){(list||[]).forEach(function(t){ticketCache[t.id]=t;});}

function showTab(name,btn){
  var names=['new','my','admin'];
  names.forEach(function(n){var el=g('tab-'+n);if(el)el.className='tab-content';});
  document.querySelectorAll('.tab-btn').forEach(function(b){b.classList.remove('active');});
  var target=g('tab-'+name);
  if(target)target.className='tab-content active';
  if(btn)btn.classList.add('active');
  if(name==='admin'&&isAdmin){loadAllTickets();}
}

function handleScreenshot(input){
  var file=input.files&&input.files[0];
  if(!file)return;
  if(file.size>1048576){showToast('Image must be under 1MB','error');input.value='';return;}
  var reader=new FileReader();
  reader.onload=function(e){
    screenshotData=e.target.result;
    g('screenshotPreview').innerHTML='<img src="'+screenshotData+'" style="max-width:100%;max-height:110px;border-radius:6px;margin-top:8px;border:1px solid #334155">';
  };
  reader.readAsDataURL(file);
}

function resetForm(){
  g('submitForm').reset();
  g('screenshotPreview').innerHTML='';
  screenshotData=null;
}

async function submitTicket(){
  var title=g('newTitle').value.trim();
  var desc=g('newDesc').value.trim();
  var email=g('newEmail').value.trim();
  var name=g('newName').value.trim();
  if(!title||!desc||!email||!name){showToast('Please fill in all required fields','error');return;}
  var btn=g('submitBtn');
  btn.disabled=true;btn.textContent='Submitting...';
  try{
    var r=await fetch(SUPP_API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      title:title,
      description:desc,
      category:g('newCategory').value,
      priority:g('newPriority').value,
      submitter_name:name,
      submitter_email:email,
      screenshot_data:screenshotData||null
    })});
    var d=await r.json();
    if(!r.ok)throw new Error(d.error||'Failed to submit');
    g('successRef').textContent=d.ticket_ref;
    g('successModal').classList.add('open');
    resetForm();
    if(isAdmin){loadAllTickets();}
  }catch(e){showToast('Error: '+e.message,'error');}
  finally{btn.disabled=false;btn.textContent='Submit Ticket';}
}

function closeSuccess(){g('successModal').classList.remove('open');}

async function lookupByEmail(){
  var email=g('lookupEmail').value.trim();
  if(!email){showToast('Enter your email address','error');return;}
  var res=g('lookupResults');
  res.innerHTML='<div style="text-align:center;padding:28px"><div class="spinner"></div></div>';
  try{
    var r=await fetch(SUPP_API+'?email='+encodeURIComponent(email));
    var d=await r.json();
    if(!r.ok)throw new Error(d.error||'Error looking up tickets');
    cacheTickets(d.tickets||[]);
    renderLookupResults(d.tickets||[]);
  }catch(e){res.innerHTML='<div style="color:#ef4444;text-align:center;padding:20px">'+esc(e.message)+'</div>';}
}

async function lookupByRef(){
  var ref=g('lookupRef').value.trim().toUpperCase();
  if(!ref){showToast('Enter a ticket reference','error');return;}
  var res=g('lookupResults');
  res.innerHTML='<div style="text-align:center;padding:28px"><div class="spinner"></div></div>';
  try{
    var r=await fetch(SUPP_API+'?ref='+encodeURIComponent(ref));
    var d=await r.json();
    if(!r.ok)throw new Error(d.error||'Ticket not found');
    cacheTickets(d.tickets||[]);
    renderLookupResults(d.tickets||[]);
  }catch(e){res.innerHTML='<div style="color:#ef4444;text-align:center;padding:20px">'+esc(e.message)+'</div>';}
}

function renderLookupResults(tickets){
  var res=g('lookupResults');
  if(!tickets.length){
    res.innerHTML='<div class="empty-state"><div class="empty-icon">🔍</div><p>No tickets found.<br>Check your email or reference number.</p></div>';
    return;
  }
  var html='<div style="font-size:12px;color:#64748b;margin-bottom:10px">Found '+tickets.length+' ticket(s)</div><div class="ticket-list">';
  tickets.forEach(function(t){html+=buildTicketRow(t);});
  html+='</div>';
  res.innerHTML=html;
}

function buildTicketRow(t){
  var st=getStatus(t.status);
  var pr=getPri(t.priority);
  return '<div class="ticket-row" onclick="openTicket(&#39;'+t.id+'&#39;)">'+
    '<div class="ticket-ref">'+esc(t.ticket_ref)+'</div>'+
    '<div class="ticket-info">'+
      '<div class="ticket-title">'+esc(t.title)+'</div>'+
      '<div class="ticket-meta">'+esc(t.submitter_name||'Anonymous')+' · '+fmtDate(t.created_at)+'</div>'+
    '</div>'+
    '<div class="ticket-badges">'+
      '<span class="badge" style="background:'+rgba(pr.color,0.15)+';color:'+pr.color+'">'+esc(pr.label)+'</span>'+
      '<span class="badge" style="background:'+rgba(st.color,0.15)+';color:'+st.color+'">'+esc(st.label)+'</span>'+
    '</div>'+
  '</div>';
}

async function loadAllTickets(){
  var list=g('adminTicketList');
  list.innerHTML='<div style="text-align:center;padding:40px"><div class="spinner"></div></div>';
  try{
    var r=await fetch(SUPP_API+'/all',{headers:{'X-Support-Admin':SUPP_ADMIN}});
    var d=await r.json();
    if(!r.ok)throw new Error(d.error||'Failed to load');
    allTickets=d.tickets||[];
    cacheTickets(allTickets);
    applyFilters();
  }catch(e){
    list.innerHTML='<div style="color:#ef4444;text-align:center;padding:20px">'+esc(e.message)+'</div>';
    if(String(e.message).toLowerCase().indexOf('database')!==-1||String(e.message).toLowerCase().indexOf('supabase')!==-1){
      g('setupBox').style.display='block';
    }
  }
}

function renderAdminStats(tickets){
  var stats={total:tickets.length,open:0,inProgress:0,resolved:0,closed:0,urgent:0};
  tickets.forEach(function(t){
    if(t.status==='open')stats.open++;
    else if(t.status==='in-progress')stats.inProgress++;
    else if(t.status==='resolved')stats.resolved++;
    else if(t.status==='closed')stats.closed++;
    if(t.priority==='urgent'&&(t.status==='open'||t.status==='in-progress'))stats.urgent++;
  });
  g('adminStats').innerHTML=
    '<div class="stat-chip">🎟 <b>'+stats.total+'</b> Total</div>'+
    '<div class="stat-chip" style="color:#ef4444">🔴 <b>'+stats.open+'</b> Open</div>'+
    '<div class="stat-chip" style="color:#f97316">🔧 <b>'+stats.inProgress+'</b> In Progress</div>'+
    '<div class="stat-chip" style="color:#22c55e">✅ <b>'+stats.resolved+'</b> Resolved</div>'+
    (stats.urgent>0?'<div class="stat-chip" style="color:#ef4444;border-color:rgba(239,68,68,0.3);background:rgba(239,68,68,0.08)">🚨 <b>'+stats.urgent+'</b> Urgent</div>':'');
}

function applyFilters(){
  var fs=g('filterStatus').value;
  var fp=g('filterPriority').value;
  var fc=g('filterCategory').value;
  filteredTickets=allTickets.filter(function(t){
    if(fs&&t.status!==fs)return false;
    if(fp&&t.priority!==fp)return false;
    if(fc&&t.category!==fc)return false;
    return true;
  });
  renderAdminStats(allTickets);
  var list=g('adminTicketList');
  if(!filteredTickets.length){
    list.innerHTML='<div class="empty-state"><div class="empty-icon">📭</div><p>No tickets match the current filters.</p></div>';
    return;
  }
  var html='<div class="ticket-list">';
  filteredTickets.forEach(function(t){html+=buildTicketRow(t);});
  html+='</div>';
  list.innerHTML=html;
}

function openTicket(id){
  var t=ticketCache[id];
  if(!t){showToast('Ticket not found','error');return;}
  currentTicket=t;
  var st=getStatus(t.status);
  var pr=getPri(t.priority);
  var catLabel=CAT_LABELS[t.category]||t.category;
  g('modalRef').textContent=t.ticket_ref;
  var adminHtml='';
  if(isAdmin){
    var stOpts='';
    STATUSES.forEach(function(s){stOpts+='<option value="'+s.key+'"'+(s.key===t.status?' selected':'')+'>'+s.label+'</option>';});
    var prOpts='';
    PRIS.forEach(function(p){prOpts+='<option value="'+p.key+'"'+(p.key===t.priority?' selected':'')+'>'+p.label+'</option>';});
    adminHtml='<div class="admin-panel">'+
      '<div class="admin-panel-hdr">🔒 Admin Controls</div>'+
      '<div class="form-row">'+
        '<div class="form-group"><label>Status</label><select id="editStatus" class="form-input">'+stOpts+'</select></div>'+
        '<div class="form-group"><label>Priority</label><select id="editPriority" class="form-input">'+prOpts+'</select></div>'+
      '</div>'+
      '<div class="form-group"><label>Internal / Customer-Facing Notes</label><textarea id="editAdminNotes" class="form-input" rows="3" placeholder="Notes visible to customer when they look up the ticket">'+esc(t.admin_notes||'')+'</textarea></div>'+
      '<div style="display:flex;gap:10px;margin-top:4px">'+
        '<button class="btn-primary" onclick="saveTicket(&#39;'+t.id+'&#39;)">Save Changes</button>'+
        '<button class="btn-danger" onclick="deleteTicket(&#39;'+t.id+'&#39;)">Delete</button>'+
      '</div>'+
    '</div>';
  }
  g('ticketContent').innerHTML=
    '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">'+
      '<span class="badge" style="background:'+rgba(st.color,0.15)+';color:'+st.color+'">'+esc(st.label)+'</span>'+
      '<span class="badge" style="background:'+rgba(pr.color,0.15)+';color:'+pr.color+'">'+esc(pr.label)+'</span>'+
      '<span class="badge" style="background:rgba(100,116,139,0.15);color:#94a3b8">'+esc(catLabel)+'</span>'+
    '</div>'+
    '<h2 style="font-size:18px;font-weight:700;margin-bottom:14px;line-height:1.3">'+esc(t.title)+'</h2>'+
    (t.description?'<div class="detail-desc">'+esc(t.description)+'</div>':'')+
    (t.screenshot_data?'<img class="detail-img" src="'+t.screenshot_data+'" alt="Screenshot">':'')+
    (t.admin_notes?'<div class="admin-note-box">📌 <strong>Update from support:</strong> '+esc(t.admin_notes)+'</div>':'')+
    '<div class="detail-meta">👤 <strong>From:</strong> '+esc(t.submitter_name||'Anonymous')+' &lt;'+esc(t.submitter_email||'')+'&gt;</div>'+
    '<div class="detail-meta">📅 <strong>Submitted:</strong> '+fmtDate(t.created_at)+'</div>'+
    (t.updated_at&&t.updated_at!==t.created_at?'<div class="detail-meta">🔄 <strong>Updated:</strong> '+fmtDate(t.updated_at)+'</div>':'')+
    adminHtml;
  g('ticketModal').classList.add('open');
}

function closeTicket(){g('ticketModal').classList.remove('open');currentTicket=null;}

async function saveTicket(id){
  var status=g('editStatus')&&g('editStatus').value;
  var priority=g('editPriority')&&g('editPriority').value;
  var notes=g('editAdminNotes')&&g('editAdminNotes').value;
  try{
    var r=await fetch(SUPP_API,{method:'PATCH',headers:{'Content-Type':'application/json','X-Support-Admin':SUPP_ADMIN},
      body:JSON.stringify({id:id,status:status,priority:priority,admin_notes:notes})});
    var d=await r.json();
    if(!r.ok)throw new Error(d.error||'Save failed');
    ticketCache[id]=d.ticket;
    for(var i=0;i<allTickets.length;i++){if(allTickets[i].id===id){allTickets[i]=d.ticket;break;}}
    applyFilters();
    closeTicket();
    showToast('Ticket updated','success');
  }catch(e){showToast('Error: '+e.message,'error');}
}

async function deleteTicket(id){
  if(!confirm('Delete this ticket permanently? This cannot be undone.'))return;
  try{
    var r=await fetch(SUPP_API,{method:'DELETE',headers:{'Content-Type':'application/json','X-Support-Admin':SUPP_ADMIN},body:JSON.stringify({id:id})});
    if(!r.ok)throw new Error('Delete failed');
    delete ticketCache[id];
    allTickets=allTickets.filter(function(t){return t.id!==id;});
    applyFilters();
    closeTicket();
    showToast('Ticket deleted','info');
  }catch(e){showToast('Error: '+e.message,'error');}
}

function openAdminModal(){
  g('adminModal').classList.add('open');
  setTimeout(function(){var p=g('adminPassword');if(p){p.value='';p.focus();}},80);
}
function closeAdminModal(){g('adminModal').classList.remove('open');}
function adminUnlock(){
  var pw=g('adminPassword');
  if(pw&&pw.value===SUPP_ADMIN){
    isAdmin=true;
    try{sessionStorage.setItem(SUPP_SESSION,'1');}catch(e){}
    closeAdminModal();
    g('adminBadge').style.display='inline-flex';
    g('adminBtn').style.display='none';
    g('adminTabBtn').style.display='inline-block';
    showToast('⭐ Admin mode active','success');
  }else{
    if(pw){pw.style.borderColor='#ef4444';setTimeout(function(){pw.style.borderColor='';},1500);}
  }
}

document.addEventListener('DOMContentLoaded',function(){
  var sq=g('setupSql');if(sq)sq.textContent=SETUP_SQL;
  if(sessionStorage.getItem(SUPP_SESSION)==='1'){
    isAdmin=true;
    var ab=g('adminBadge'),btn=g('adminBtn'),atb=g('adminTabBtn');
    if(ab)ab.style.display='inline-flex';
    if(btn)btn.style.display='none';
    if(atb)atb.style.display='inline-block';
  }
  var params=new URLSearchParams(window.location.search);
  var presetRef=params.get('ref');
  var presetEmail=params.get('email');
  if(presetRef){g('lookupRef').value=presetRef;showTab('my',document.querySelectorAll('.tab-btn')[1]);lookupByRef();}
  else if(presetEmail){g('lookupEmail').value=presetEmail;showTab('my',document.querySelectorAll('.tab-btn')[1]);lookupByEmail();}
});
</script>
</body>
</html>`;

// -------------------------------------------------------------------
// Worker fetch handler
// -------------------------------------------------------------------
export default {
  async fetch(request, env) {
    var url = new URL(request.url);
    var path = url.pathname;
    var method = request.method;

    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders({}, request) });
    }

    // Serve the page
    if (method === "GET" && (path === "/" || path === "")) {
      return new Response(SUPPORT_HTML, {
        status: 200,
        headers: {
          "Content-Type": "text/html;charset=UTF-8",
          "Cache-Control": "no-store"
        }
      });
    }

    // Debug endpoint — admin-only, and NEVER echoes env values or response bodies
    if (path === "/api/debug") {
      var ADMIN_PASS_D = env.SUPPORT_ADMIN_PASS || "TeamListing2027!";
      if (request.headers.get("X-Support-Admin") !== ADMIN_PASS_D) {
        return json({ error: "Unauthorized" }, 401, request);
      }
      var SB_URL_D = env.SUPABASE_URL || "";
      var SB_KEY_D = env.SUPABASE_KEY || "";
      var urlLooksValid = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(SB_URL_D.replace(/\/$/, ""));
      var keyLooksValid = !!SB_KEY_D && (SB_KEY_D.startsWith("eyJ") || SB_KEY_D.startsWith("sb_"));
      var testStatus = null, testOk = null;
      if (urlLooksValid && keyLooksValid) {
        try {
          var testRes = await fetch(SB_URL_D.replace(/\/$/, "") + "/rest/v1/support_tickets?limit=1", {
            headers: { "apikey": SB_KEY_D, "Authorization": "Bearer " + SB_KEY_D }
          });
          testStatus = testRes.status;
          testOk = testRes.ok;
        } catch (e) {
          console.error("[debug] supabase reachability check failed:", e && (e.message || e));
          testStatus = "fetch_failed";
          testOk = false;
        }
      }
      return json({
        sb_url_set: !!SB_URL_D,
        sb_url_valid_shape: urlLooksValid,
        sb_key_set: !!SB_KEY_D,
        sb_key_valid_shape: keyLooksValid,
        sb_key_length: SB_KEY_D ? SB_KEY_D.length : 0,
        supabase_reachable: testOk,
        supabase_status: testStatus
      }, 200, request);
    }

    // API routes
    if (path.startsWith("/api/tickets")) {
      var SB_URL = env.SUPABASE_URL || "";
      var SB_KEY = env.SUPABASE_KEY || "";
      var ADMIN_PASS = env.SUPPORT_ADMIN_PASS || "TeamListing2027!";

      if (!SB_URL || !SB_KEY) {
        return json({ error: "Supabase not configured. Set SUPABASE_URL and SUPABASE_KEY." }, 503, request);
      }

      var sbH = {
        "apikey": SB_KEY,
        "Authorization": "Bearer " + SB_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      };
      var sbHRead = { "apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY };
      var TABLE = SB_URL + "/rest/v1/support_tickets";

      // GET /api/tickets?email= or ?ref=
      if (method === "GET" && path === "/api/tickets") {
        var email = url.searchParams.get("email");
        var ref = url.searchParams.get("ref");
        try {
          var q = TABLE + "?select=id,ticket_ref,title,description,category,priority,status,submitter_name,submitter_email,admin_notes,screenshot_data,created_at,updated_at";
          if (email) {
            q += "&submitter_email=eq." + encodeURIComponent(email.toLowerCase()) + "&order=created_at.desc";
          } else if (ref) {
            q += "&ticket_ref=eq." + encodeURIComponent(ref.toUpperCase());
          } else {
            return json({ error: "Provide ?email= or ?ref=" }, 400, request);
          }
          var res = await fetch(q, { headers: sbHRead });
          var tickets = await res.json().catch(function () { return []; });
          return json({ tickets: Array.isArray(tickets) ? tickets : [] }, 200, request);
        } catch (e) {
          return safeError(e, "GET /api/tickets", request);
        }
      }

      // GET /api/tickets/all - admin
      if (method === "GET" && path === "/api/tickets/all") {
        if (request.headers.get("X-Support-Admin") !== ADMIN_PASS) {
          return json({ error: "Unauthorized" }, 401, request);
        }
        try {
          var res2 = await fetch(TABLE + "?order=created_at.desc", { headers: sbHRead });
          var all = await res2.json().catch(function () { return []; });
          return json({ tickets: Array.isArray(all) ? all : [] }, 200, request);
        } catch (e) {
          return safeError(e, "GET /api/tickets/all", request);
        }
      }

      // POST /api/tickets - create ticket (public)
      if (method === "POST" && path === "/api/tickets") {
        try {
          var body = await request.json();
          if (!body.title || !String(body.title).trim()) return json({ error: "Title required" }, 400, request);
          if (!body.submitter_email || !String(body.submitter_email).trim()) return json({ error: "Email required" }, 400, request);
          var VALID_CATS = ["general", "technical", "account", "billing", "feature", "bug", "other"];
          var VALID_PRIS = ["low", "medium", "high", "urgent"];
          var ref2 = "TLT-" + Math.random().toString(36).toUpperCase().slice(2, 8);
          var item = {
            ticket_ref: ref2,
            title: String(body.title).slice(0, 160),
            description: body.description ? String(body.description).slice(0, 4000) : null,
            category: VALID_CATS.indexOf(body.category) !== -1 ? body.category : "general",
            priority: VALID_PRIS.indexOf(body.priority) !== -1 ? body.priority : "medium",
            status: "open",
            submitter_name: body.submitter_name ? String(body.submitter_name).slice(0, 80) : "Anonymous",
            submitter_email: String(body.submitter_email).toLowerCase().slice(0, 120),
            screenshot_data: body.screenshot_data ? String(body.screenshot_data).slice(0, 2000000) : null,
            admin_notes: null
          };
          var res3 = await fetch(TABLE, { method: "POST", headers: sbH, body: JSON.stringify(item) });
          var data = await res3.json().catch(function () { return null; });
          var created = Array.isArray(data) ? data[0] : data;
          if (!res3.ok) {
            console.error("[POST /api/tickets] DB error status=" + res3.status + " body=", data);
            return json({ error: "Database error" }, res3.status, request);
          }
          sendNotification(env, "ticket.created", {
            ticket_ref: ref2,
            title: item.title,
            submitter_name: item.submitter_name,
            submitter_email: item.submitter_email,
            category: item.category,
            priority: item.priority,
            description: (item.description || "").slice(0, 500)
          });
          return json({ ticket: created, ticket_ref: ref2 }, 201, request);
        } catch (e) {
          return safeError(e, "POST /api/tickets", request);
        }
      }

      // PATCH /api/tickets - update (admin)
      if (method === "PATCH" && path === "/api/tickets") {
        if (request.headers.get("X-Support-Admin") !== ADMIN_PASS) {
          return json({ error: "Unauthorized" }, 401, request);
        }
        try {
          var b2 = await request.json();
          if (!b2.id) return json({ error: "Missing id" }, 400, request);
          var VALID_S = ["open", "in-progress", "resolved", "closed"];
          var VALID_P = ["low", "medium", "high", "urgent"];
          var upd = { updated_at: new Date().toISOString() };
          if (b2.status && VALID_S.indexOf(b2.status) !== -1) upd.status = b2.status;
          if (b2.priority && VALID_P.indexOf(b2.priority) !== -1) upd.priority = b2.priority;
          if (b2.admin_notes !== undefined) upd.admin_notes = b2.admin_notes || null;
          var res4 = await fetch(TABLE + "?id=eq." + b2.id, { method: "PATCH", headers: sbH, body: JSON.stringify(upd) });
          var d2 = await res4.json().catch(function () { return []; });
          var updated = Array.isArray(d2) ? d2[0] : d2;
          if (!res4.ok) {
            console.error("[PATCH /api/tickets] DB error status=" + res4.status + " body=", d2);
            return json({ error: "Database error" }, res4.status, request);
          }
          sendNotification(env, "ticket.updated", {
            ticket_ref: (updated && updated.ticket_ref) || b2.id,
            status: upd.status || "",
            priority: upd.priority || "",
            admin_notes: (upd.admin_notes || "").slice(0, 500)
          });
          return json({ ticket: updated }, 200, request);
        } catch (e) {
          return safeError(e, "PATCH /api/tickets", request);
        }
      }

      // DELETE /api/tickets - delete (admin)
      if (method === "DELETE" && path === "/api/tickets") {
        if (request.headers.get("X-Support-Admin") !== ADMIN_PASS) {
          return json({ error: "Unauthorized" }, 401, request);
        }
        try {
          var b3 = await request.json();
          if (!b3.id) return json({ error: "Missing id" }, 400, request);
          var res5 = await fetch(TABLE + "?id=eq." + b3.id, {
            method: "DELETE",
            headers: Object.assign({}, sbH, { "Prefer": "return=minimal" })
          });
          if (!res5.ok) {
            console.error("[DELETE /api/tickets] DB error status=" + res5.status);
            return json({ error: "Delete failed" }, res5.status, request);
          }
          return json({ ok: true }, 200, request);
        } catch (e) {
          return safeError(e, "DELETE /api/tickets", request);
        }
      }
    }

    return json({ error: "Not found" }, 404, request);
  }
};
