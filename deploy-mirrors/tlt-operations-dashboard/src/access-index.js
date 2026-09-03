import dashboard from './index.js';

const PASSWORD_SHA256_HEX = '27727916f2870e4cc23130b1eb456138a24e864f5e8b3a5305f35ebe65905aff';
const BROWSER_RUN_HEALTH_URL = 'https://tlt-browser-run-mcp-server.lehr007.workers.dev/health';

function equalHex(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

async function passwordMatches(candidate) {
  if (!candidate) return false;
  return equalHex(await sha256Hex(candidate), PASSWORD_SHA256_HEX);
}

function accessIdentity(req, env) {
  const expected = String(env.ACCESS_ALLOWED_EMAIL || '').trim().toLowerCase();
  const email = String(req.headers.get('cf-access-authenticated-user-email') || '').trim().toLowerCase();
  const assertion = req.headers.get('cf-access-jwt-assertion');
  return Boolean(expected && assertion && email && email === expected);
}

async function browserRunHealth() {
  try {
    const response = await fetch(BROWSER_RUN_HEALTH_URL, {
      headers: { accept: 'application/json' },
      cf: { cacheTtl: 0, cacheEverything: false }
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    const healthy = Boolean(
      response.ok &&
      data?.ok === true &&
      data?.browser_binding_configured === true &&
      data?.auth_configured === true
    );
    return {
      ok: healthy,
      status: response.status,
      service: data?.service || 'tlt-browser-run-mcp-server',
      runtime: data?.runtime || 'cloudflare-browser-run',
      browser_binding_configured: data?.browser_binding_configured === true,
      auth_configured: data?.auth_configured === true,
      external_state_changes_require_approval: data?.external_state_changes_require_approval !== false,
      endpoint: 'https://tlt-browser-run-mcp-server.lehr007.workers.dev/mcp',
      verified_workflow_run: 33718162316
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      service: 'tlt-browser-run-mcp-server',
      runtime: 'cloudflare-browser-run',
      error: String(error?.message || error),
      endpoint: 'https://tlt-browser-run-mcp-server.lehr007.workers.dev/mcp',
      verified_workflow_run: 33718162316
    };
  }
}

async function dashboardResponse(req, env, ctx) {
  return dashboard.fetch(req, env, ctx);
}

export default {
  async fetch(req, env, ctx) {
    try {
      const url = new URL(req.url);

      if (accessIdentity(req, env) && env.DASHBOARD_ACCESS_TOKEN) {
        const headers = new Headers(req.headers);
        headers.set('authorization', 'Bearer ' + env.DASHBOARD_ACCESS_TOKEN);
        const authenticated = new Request(req, { headers });
        return dashboardResponse(authenticated, env, ctx);
      }

      if (url.pathname === '/session' && req.method === 'POST' && env.DASHBOARD_ACCESS_TOKEN) {
        const form = await req.formData();
        const candidate = String(form.get('token') || '');
        if (await passwordMatches(candidate)) {
          const authenticatedLogin = new Request(req.url, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token: env.DASHBOARD_ACCESS_TOKEN }).toString(),
            redirect: 'manual'
          });
          return dashboardResponse(authenticatedLogin, env, ctx);
        }
      }

      const response = await dashboardResponse(req, env, ctx);

      if (url.pathname === '/api/snapshot' && response.ok && response.headers.get('content-type')?.includes('application/json')) {
        const snapshot = await response.json();
        const browserRun = await browserRunHealth();
        snapshot.sources = snapshot.sources || {};
        snapshot.sources.browser_run_mcp = {
          ok: browserRun.ok,
          status: browserRun.status,
          error: browserRun.error || null
        };
        snapshot.summary = snapshot.summary || {};
        snapshot.summary.browser_run_mcp_healthy = browserRun.ok;
        snapshot.browser_run = browserRun;
        snapshot.capabilities = snapshot.capabilities || {};
        snapshot.capabilities.browser_automation = {
          status: browserRun.ok ? 'PRODUCTION_VERIFIED' : 'DEGRADED',
          runtime: 'Cloudflare Browser Run / Playwright MCP',
          read_test_lane: 'automatic_audited',
          external_state_changes: 'approval_required'
        };
        return new Response(JSON.stringify(snapshot, null, 2), {
          status: response.status,
          headers: response.headers
        });
      }

      if (url.pathname === '/login' && req.method === 'GET' && response.headers.get('content-type')?.includes('text/html')) {
        const text = (await response.text()).replace('placeholder="Access token"', 'placeholder="Password"');
        return new Response(text, { status: response.status, headers: response.headers });
      }
      return response;
    } catch (error) {
      return new Response('Dashboard authentication error. Please try again.', {
        status: 500,
        headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
      });
    }
  }
};
