import dashboard from './index.js';

function accessIdentity(req, env) {
  const expected = String(env.ACCESS_ALLOWED_EMAIL || '').trim().toLowerCase();
  const email = String(req.headers.get('cf-access-authenticated-user-email') || '').trim().toLowerCase();
  const assertion = req.headers.get('cf-access-jwt-assertion');
  return Boolean(expected && assertion && email && email === expected);
}

export default {
  async fetch(req, env, ctx) {
    if (accessIdentity(req, env) && env.DASHBOARD_ACCESS_TOKEN) {
      const headers = new Headers(req.headers);
      headers.set('authorization', 'Bearer ' + env.DASHBOARD_ACCESS_TOKEN);
      const authenticated = new Request(req, { headers });
      return dashboard.fetch(authenticated, env, ctx);
    }
    return dashboard.fetch(req, env, ctx);
  }
};
