import dashboard from './index.js';

const PASSWORD_SALT_B64URL = 'ggpcC96iMLSwJX2EDQBXtg';
const PASSWORD_HASH_B64URL = 'XB7dS1H-rjEEAi0eI9K6ZZGmarWocIJBsVOKqpeSp8s';
const PASSWORD_ITERATIONS = 310000;

function b64urlBytes(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const raw = atob(base64);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

function equalBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function passwordMatches(candidate) {
  if (!candidate) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(candidate),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: b64urlBytes(PASSWORD_SALT_B64URL),
      iterations: PASSWORD_ITERATIONS
    },
    key,
    256
  );
  return equalBytes(new Uint8Array(bits), b64urlBytes(PASSWORD_HASH_B64URL));
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
    const url = new URL(req.url);

    if (accessIdentity(req, env) && env.DASHBOARD_ACCESS_TOKEN) {
      const headers = new Headers(req.headers);
      headers.set('authorization', 'Bearer ' + env.DASHBOARD_ACCESS_TOKEN);
      const authenticated = new Request(req, { headers });
      return dashboardResponse(authenticated, env, ctx);
    }

    if (url.pathname === '/session' && req.method === 'POST' && env.DASHBOARD_ACCESS_TOKEN) {
      const form = await req.clone().formData();
      const candidate = String(form.get('token') || '');
      if (await passwordMatches(candidate)) {
        const body = new URLSearchParams({ token: env.DASHBOARD_ACCESS_TOKEN });
        const headers = new Headers(req.headers);
        headers.set('content-type', 'application/x-www-form-urlencoded');
        headers.delete('content-length');
        const authenticatedLogin = new Request(req.url, {
          method: 'POST',
          headers,
          body: body.toString(),
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
  }
};
