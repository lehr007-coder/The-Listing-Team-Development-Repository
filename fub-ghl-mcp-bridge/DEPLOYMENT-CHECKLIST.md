# Deployment Checklist

Complete this checklist to ensure your FUB-GHL MCP bridge is production-ready.

## Pre-Deployment

- [ ] Node.js 18+ installed (`node --version`)
- [ ] npm installed (`npm --version`)
- [ ] Cloudflare account created
- [ ] Cloudflare Worker enabled in account
- [ ] All 5 API credentials obtained:
  - [ ] FUB_API_KEY
  - [ ] FUB_X_SYSTEM
  - [ ] FUB_X_SYSTEM_KEY
  - [ ] GHL_PRIVATE_TOKEN
  - [ ] GHL_LOCATION_ID

## Build & Setup

- [ ] Navigate to project directory: `cd fub-ghl-mcp-bridge`
- [ ] Install dependencies: `npm install`
- [ ] Build TypeScript: `npm run build`
- [ ] Verify dist/ folder created: `ls dist/`
- [ ] dist/index.js exists and has content (> 50KB)

## Cloudflare Setup

- [ ] Wrangler installed globally: `npm install -g wrangler`
- [ ] Logged in to Cloudflare: `wrangler login`
- [ ] Can see account info: `wrangler whoami`

## Secrets Management

- [ ] FUB_API_KEY set: `wrangler secret put FUB_API_KEY`
  - Verified with: `wrangler secret list` (should show as "encrypted")
- [ ] FUB_X_SYSTEM set: `wrangler secret put FUB_X_SYSTEM`
  - Verified with: `wrangler secret list`
- [ ] FUB_X_SYSTEM_KEY set: `wrangler secret put FUB_X_SYSTEM_KEY`
  - Verified with: `wrangler secret list`
- [ ] GHL_PRIVATE_TOKEN set: `wrangler secret put GHL_PRIVATE_TOKEN`
  - Verified with: `wrangler secret list`
- [ ] GHL_LOCATION_ID set: `wrangler secret put GHL_LOCATION_ID`
  - Verified with: `wrangler secret list`

**All 5 secrets should appear in secret list output (marked as encrypted)**

## Deployment

- [ ] Run deployment: `npm run deploy`
- [ ] Deployment succeeds (no errors)
- [ ] Worker URL displayed (format: `https://fub-ghl-mcp-bridge.*.workers.dev`)
- [ ] Copy worker URL for testing

## Health Check Test

Test your deployed worker:

```bash
curl -X POST https://fub-ghl-mcp-bridge.YOUR-WORKER-URL.workers.dev \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "health_check",
    "params": {}
  }'
```

- [ ] Response code: 200
- [ ] Response contains: `"status": "ok"`
- [ ] Response contains: `"service": "fub-ghl-mcp-bridge"`
- [ ] Timestamp is recent (within last minute)

## Tool Testing (Use provided test-suite.ts)

Run tests with:
```bash
npm run test
```

- [ ] search_fub_person test passes
- [ ] get_fub_person test passes
- [ ] create_or_update_ghl_contact test passes
- [ ] sync_fub_person_to_ghl test passes
- [ ] create_ghl_opportunity_from_fub_deal test passes
- [ ] health_check test passes

## Rate Limiting Test

```bash
# Run 101 requests rapidly (should hit limit on 101st)
for i in {1..101}; do
  curl -s -X POST https://fub-ghl-mcp-bridge.YOUR-WORKER-URL.workers.dev \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":'$i',"method":"health_check","params":{}}'
done
```

- [ ] First 100 requests return 200
- [ ] 101st request returns 429 (Too Many Requests)
- [ ] Rate limit header present: `X-RateLimit-Remaining`

## Logging & Monitoring

- [ ] View logs: `wrangler tail`
- [ ] Logs show recent requests
- [ ] No API keys visible in logs
- [ ] Structured logging with requestId present

## Documentation Review

- [ ] README.md reviewed (complete reference)
- [ ] DEPLOYMENT.md reviewed (integration guides)
- [ ] EXAMPLES.md reviewed (code examples)
- [ ] FIELD-MAPPING.md reviewed (data mapping)
- [ ] QUICK-START.md reviewed (quick reference)

## Integration - Claude Code

- [ ] Claude Code MCP config created (.mcp.json)
- [ ] Worker URL configured in Claude Code
- [ ] All 6 tools visible in Claude Code
- [ ] Test search_fub_person in Claude Code
- [ ] Test sync_fub_person_to_ghl in Claude Code

## Integration - GHL AI Agent Studio

- [ ] Custom API integration added to GHL
- [ ] Worker URL configured in GHL
- [ ] Created test tool mapping
- [ ] Created test workflow using MCP tools
- [ ] Tested workflow executes successfully
- [ ] Verified no existing GHL workflows affected

## Security Verification

- [ ] No API keys in code files
- [ ] No API keys in git history
- [ ] No API keys in logs
- [ ] No API keys in responses
- [ ] Error messages are generic (no sensitive data)
- [ ] HTTPS enforced (all URLs use https://)
- [ ] Rate limiting active
- [ ] Request timeout set to 15 seconds

## Performance Baseline

Measure and record these times:

- [ ] Health check response time: _____ ms
- [ ] Search FUB person response time: _____ ms
- [ ] Sync FUB to GHL response time: _____ ms
- [ ] Average response time: _____ ms

**Expected:**
- Health check: 50-150ms
- Search: 500-1500ms
- Sync: 1500-3000ms

## Custom Domain (Optional)

- [ ] Custom domain added to Cloudflare
- [ ] DNS configured
- [ ] wrangler.toml updated with custom domain
- [ ] Redeployed to custom domain: `npm run deploy:prod`
- [ ] Custom domain health check passes

## Production Hardening

- [ ] Environment set to production in wrangler.toml
- [ ] LOG_LEVEL set to "info" (not "debug")
- [ ] RATE_LIMIT_REQUESTS reviewed for production load
- [ ] REQUEST_TIMEOUT appropriate for FUB/GHL APIs
- [ ] Error tracking/monitoring set up (optional)

## Final Sign-Off

- [ ] All tests passing
- [ ] No errors in logs
- [ ] Documentation complete and accurate
- [ ] Team members can deploy using QUICK-START.md
- [ ] Ready for production use

**Date Completed:** _______________

**Deployed By:** _______________

**Production URL:** _________________________________

---

## Rollback Plan

If issues occur in production:

1. Check logs: `wrangler tail`
2. Identify the issue
3. Rollback if needed:
   ```bash
   wrangler rollback
   ```
4. Or redeploy with fix:
   ```bash
   npm run deploy
   ```

---

## Monitoring Tasks (Ongoing)

After deployment, perform these regularly:

**Daily:**
- [ ] Check error logs: `wrangler tail --status error`
- [ ] Monitor rate limit usage

**Weekly:**
- [ ] Review performance metrics
- [ ] Check for API deprecation notices
- [ ] Verify sync quality (sample synced contacts)

**Monthly:**
- [ ] Review all logs
- [ ] Check FUB/GHL API status pages
- [ ] Update dependencies: `npm update`
- [ ] Review security advisories

---

For detailed information, see:
- [README.md](README.md)
- [DEPLOYMENT.md](DEPLOYMENT.md)
- [QUICK-START.md](QUICK-START.md)
