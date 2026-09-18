import test from 'node:test';
import assert from 'node:assert/strict';
import dashboard from '../src/index.js';

function request(method = 'POST', authenticated = true) {
  return new Request('https://dashboard.example/api/canary/superpowers-workflow', {
    method,
    headers: authenticated ? { authorization: 'Bearer dashboard-test-token' } : {}
  });
}

function environment(canary) {
  return {
    DASHBOARD_ACCESS_TOKEN: 'dashboard-test-token',
    SUPERPOWERS_CANARY: canary
  };
}

test('private workflow canary is unreachable without dashboard authentication', async () => {
  let called = false;
  const response = await dashboard.fetch(request('POST', false), environment({
    async runSanitizedWorkflowCanary() {
      called = true;
      return { ok: true };
    }
  }));

  assert.equal(response.status, 401);
  assert.equal(called, false);
});

test('authenticated dashboard calls the named private service binding', async () => {
  const response = await dashboard.fetch(request(), environment({
    async runSanitizedWorkflowCanary() {
      return {
        ok: true,
        final_state: 'COMPLETE',
        completed_stages: ['intake', 'lead_context', 'property_data', 'transaction_review', 'compliance'],
        external_write_attempted: false,
        production_or_public_write_attempted: false
      };
    }
  }));
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.ok, true);
  assert.equal(result.final_state, 'COMPLETE');
  assert.equal(result.external_write_attempted, false);
});

test('private workflow canary accepts POST only and fails closed without its binding', async () => {
  const wrongMethod = await dashboard.fetch(request('GET'), environment({}));
  assert.equal(wrongMethod.status, 405);

  const missingBinding = await dashboard.fetch(request(), environment(undefined));
  assert.equal(missingBinding.status, 503);
  assert.deepEqual(await missingBinding.json(), {
    ok: false,
    error: 'private_workflow_canary_binding_missing'
  });
});
