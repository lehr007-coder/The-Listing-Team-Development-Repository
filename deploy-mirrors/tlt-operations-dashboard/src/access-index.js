import dashboard from './index.js';

const PASSWORD_SHA256_HEX = '27727916f2870e4cc23130b1eb456138a24e864f5e8b3a5305f35ebe65905aff';

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
