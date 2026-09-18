import test from 'node:test';
import assert from 'node:assert/strict';
import dashboard from '../src/access-index.js';

function accessRequest(email) {
  return new Request('https://dashboard.example/api/canary/superpowers-workflow', {
    method: 'POST',
    headers: {
      'cf-access-authenticated-user-email': email,
      'cf-access-jwt-assertion': 'test-access-assertion'
    }
  });
}

function environment() {
  return {
    ACCESS_ALLOWED_EMAIL: 'owner@example.com',
    DASHBOARD_ACCESS_TOKEN: 'dashboard-test-token',
    SUPERPOWERS_CANARY: {
      async runSanitizedWorkflowCanary() {
        return {
          ok: true,
          final_state: 'COMPLETE',
          completed_stages: ['intake'],
          external_write_attempted: false,
          production_or_public_write_attempted: false
        };
      }
    }
  };
}

test('Cloudflare Access identity receives the internal Dashboard session', async () => {
  const response = await dashboard.fetch(accessRequest('OWNER@example.com'), environment());
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.ok, true);
  assert.equal(result.final_state, 'COMPLETE');
});

test('a different Access identity does not receive the internal Dashboard session', async () => {
  const response = await dashboard.fetch(accessRequest('someone-else@example.com'), environment());

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { ok: false, error: 'unauthorized' });
});
