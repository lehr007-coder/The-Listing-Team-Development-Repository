# Testing & Monitoring Guide

## Overview

This guide covers running tests and monitoring the FUB-GHL MCP Bridge in development and production.

---

## Testing

### Test Suite Overview

The test suite (`src/tests.ts`) validates:
- Health check endpoint
- FUB search by email
- FUB search by phone
- FUB person retrieval
- GHL contact creation/update
- Input validation
- Rate limiting
- Error handling

### Running Tests

#### Prerequisites

Set environment variables with your credentials:

```bash
export FUB_API_KEY="your_key"
export FUB_X_SYSTEM="your_system"
export FUB_X_SYSTEM_KEY="your_system_key"
export GHL_PRIVATE_TOKEN="your_token"
export GHL_LOCATION_ID="your_location_id"
```

Or create `.env.local` from `.env.example`:

```bash
cp .env.example .env.local
# Edit .env.local with your actual credentials
source .env.local
```

#### Run All Tests

```bash
npm run test
```

#### Run Specific Tests

The test suite uses a sequential runner. To run only certain tests, modify `src/tests.ts`:

```typescript
// Comment out tests you don't want to run
await runTest("health_check", async () => { ... });
// await runTest("search_fub_person (by email)", async () => { ... });
```

#### Expected Output

```
================================================
FUB-GHL MCP Bridge - Test Suite
================================================

Running tests...

✓ health_check (45ms)
✓ search_fub_person (by email) (523ms)
✓ search_fub_person (by phone) (518ms)
✓ get_fub_person (mock) (402ms)
✓ create_or_update_ghl_contact (1205ms)
✓ input validation (12ms)
✓ rate limiter (simulated) (18ms)
✓ error handling (8ms)

================================================
Test Results
================================================

✓ health_check (45ms)
✓ search_fub_person (by email) (523ms)
✓ search_fub_person (by phone) (518ms)
✓ get_fub_person (mock) (402ms)
✓ create_or_update_ghl_contact (1205ms)
✓ input validation (12ms)
✓ rate limiter (simulated) (18ms)
✓ error handling (8ms)

Passed: 8/8
Failed: 0/8
Total Time: 2729ms

✅ All tests passed!
```

### Test Details

#### 1. Health Check Test

Validates:
- Service responds
- Status is "ok"
- Correct service name
- Valid timestamp

```bash
Typical response time: 50-150ms
```

#### 2. Search FUB Person (Email)

Searches Follow Up Boss by email.

```bash
Typical response time: 500-1500ms
```

Result varies based on:
- Whether matching contacts exist in FUB
- FUB API response time

#### 3. Search FUB Person (Phone)

Searches Follow Up Boss by phone.

```bash
Typical response time: 500-1500ms
```

#### 4. Get FUB Person (Mock)

Tests person retrieval with a non-existent ID to verify:
- API structure is correct
- Not an authentication error

```bash
Expected: Error about person not found
Typical response time: 400-800ms
```

#### 5. Create/Update GHL Contact

Creates a new test contact in GoHighLevel.

```bash
Typical response time: 800-2000ms
```

**Note:** This creates real contacts in your GHL account. Use a test location if possible.

#### 6. Input Validation Test

Tests that the API properly validates inputs:
- Missing required fields are rejected
- Search requires at least one parameter

```bash
Typical response time: 10-20ms
```

#### 7. Rate Limiter Test

Runs health check 5 times to validate rate limiter works.

```bash
Typical response time: 50-100ms (total for 5 calls)
```

#### 8. Error Handling Test

Validates that errors are properly caught and formatted.

```bash
Typical response time: 10-30ms
```

### Interpreting Test Results

**All tests passed:** ✅ Service is working correctly

**Some tests failed:**
1. Check error message for specific issue
2. Review prerequisites (credentials set correctly)
3. Check API status pages:
   - https://status.followupboss.com/
   - https://status.gohighlevel.com/

**Tests are slow:**
1. Check network connectivity
2. Monitor API response times
3. Increase `REQUEST_TIMEOUT` if needed

### Troubleshooting Tests

#### "Missing credentials" error

```bash
# Verify environment variables are set
echo $FUB_API_KEY
echo $GHL_PRIVATE_TOKEN

# If empty, set them:
export FUB_API_KEY="your_key"
```

#### "Authentication failed"

- Verify API keys are correct and not expired
- Check if tokens have been rotated in source systems
- Verify credentials haven't been accidentally modified

#### "Connection timeout"

- Check network connectivity
- Verify API endpoints are accessible:
  ```bash
  curl -I https://api.followupboss.com/v1/people/search
  curl -I https://rest.gohighlevel.com/v1/contacts
  ```
- Increase `REQUEST_TIMEOUT` in environment

#### "Rate limit exceeded"

This is normal if running many tests rapidly. Wait a minute and retry.

---

## Monitoring

### Monitoring Script Overview

The monitoring script (`src/monitoring.ts`) continuously monitors:
- Service availability
- Response times
- Error rates
- Uptime percentage
- Rate limiting

### Running Monitoring

#### Prerequisites

Set environment variable with your worker URL:

```bash
export WORKER_URL="https://fub-ghl-mcp-bridge.example.workers.dev"
```

Or create `.env.local` and source it:

```bash
source .env.local
```

#### Start Monitoring

```bash
npx ts-node src/monitoring.ts
```

#### Example Output

```
================================================
FUB-GHL MCP Bridge - Service Monitor
================================================
Worker URL: https://fub-ghl-mcp-bridge.example.workers.dev
Check Interval: 30000ms

[2024-12-01T12:00:00.000Z] ✓ Health check passed (95ms)
[2024-12-01T12:00:30.000Z] ✓ Health check passed (88ms)
[2024-12-01T12:01:00.000Z] ⚠ Slow response time: 5234ms (threshold: 5000ms)
[2024-12-01T12:01:30.000Z] ✓ Health check passed (92ms)

Current Status:
  Checks: 4
  Uptime: 100%
  Error Rate: 0%
  Avg Response: 102ms
  Min Response: 88ms
  Max Response: 5234ms
  Consecutive Failures: 0
```

### Configuration

Configure monitoring via environment variables:

```bash
export WORKER_URL="https://your-worker.workers.dev"
export CHECK_INTERVAL="30000"  # 30 seconds
export SLACK_WEBHOOK_URL="https://hooks.slack.com/..."  # Optional
```

Or edit `src/monitoring.ts` directly:

```typescript
const config: MonitoringConfig = {
  workerUrl: "https://fub-ghl-mcp-bridge.example.workers.dev",
  checkInterval: 30000,  // 30 seconds
  alertThreshold: {
    responseTime: 5000,   // 5 seconds
    errorRate: 10,        // 10%
    consecutiveFailures: 3,
  },
  slackWebhook: process.env.SLACK_WEBHOOK_URL,
};
```

### Monitoring Metrics

#### Response Time

- **Good:** < 100ms
- **Warning:** 100-1000ms
- **Alert:** > 5000ms

Typical response times:
- Health check: 50-100ms
- Full sync: 1500-3000ms

#### Error Rate

- **Good:** 0%
- **Warning:** < 5%
- **Alert:** > 10%

#### Uptime

- **Good:** > 99.5%
- **Warning:** 99-99.5%
- **Alert:** < 99%

### Alert Thresholds

Default alerts trigger when:
1. Response time exceeds 5 seconds
2. Error rate exceeds 10%
3. 3 consecutive check failures occur

### Slack Integration

To receive alerts in Slack:

1. Create incoming webhook in Slack workspace
2. Set environment variable:
   ```bash
   export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
   ```
3. Restart monitoring script

Example Slack alert:

```
🚨 FUB-GHL MCP Bridge Alert

Issue: Service down: 3 consecutive failures
Uptime: 95.23%
Error Rate: 25.00%
Avg Response: 4500ms
Timestamp: 2024-12-01T12:05:30.000Z
```

### Interpreting Monitoring Data

**High response times:**
- Check if FUB/GHL APIs are slow
- Check network connectivity
- Monitor logs for errors

**High error rate:**
- Check API status pages
- Review error logs
- Verify credentials are still valid

**Service down:**
- Check worker is deployed: `wrangler deployments list`
- Review error logs: `wrangler tail`
- Check if secrets are set: `wrangler secret list`

---

## Continuous Monitoring Setup

### Option 1: Local Terminal

Run monitoring in a dedicated terminal:

```bash
npx ts-node src/monitoring.ts
```

Leave running continuously.

### Option 2: Background Process (Mac/Linux)

```bash
# Start monitoring in background
npx ts-node src/monitoring.ts &

# Save process ID
echo $! > monitoring.pid

# Check status
ps aux | grep monitoring

# Stop monitoring
kill $(cat monitoring.pid)
```

### Option 3: Docker Container

```dockerfile
FROM node:18

WORKDIR /app
COPY . .
RUN npm install

ENV WORKER_URL=https://fub-ghl-mcp-bridge.example.workers.dev
ENV CHECK_INTERVAL=30000
ENV SLACK_WEBHOOK_URL=optional

CMD ["npx", "ts-node", "src/monitoring.ts"]
```

Build and run:

```bash
docker build -t fub-ghl-monitor .
docker run -d \
  -e WORKER_URL="https://your-worker.workers.dev" \
  -e SLACK_WEBHOOK_URL="https://hooks.slack.com/..." \
  fub-ghl-monitor
```

### Option 4: Kubernetes CronJob

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: fub-ghl-health-check
spec:
  schedule: "*/5 * * * *"  # Every 5 minutes
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: monitor
              image: fub-ghl-monitor:latest
              env:
                - name: WORKER_URL
                  value: https://fub-ghl-mcp-bridge.example.workers.dev
          restartPolicy: OnFailure
```

---

## Production Monitoring

### Recommended Setup

For production deployment:

1. **Continuous monitoring** via Slack integration
2. **Daily health summary** (email or dashboard)
3. **Alert thresholds** tuned for your traffic
4. **Log aggregation** (e.g., Cloudflare tail)
5. **Dashboard** showing uptime, performance metrics

### Cloudflare Analytics

View worker analytics:

```bash
# Recent deployments
wrangler deployments list

# Live logs
wrangler tail --format pretty

# Filter by status
wrangler tail --status error

# Search logs
wrangler tail --search "sync_fub_person_to_ghl"
```

### Recommended Alerts

Set up alerts for:

- ❌ Service down (0% uptime for 5 minutes)
- ⚠️ High latency (avg > 2 seconds)
- ⚠️ High error rate (> 5%)
- ⚠️ Auth failures (401/403 errors)

---

## Performance Baseline

Record these metrics after deployment:

| Metric | Expected | Your Value |
|--------|----------|------------|
| Health check | 50-100ms | __________ |
| Search FUB | 500-1500ms | __________ |
| Create GHL | 800-2000ms | __________ |
| Full sync | 1500-3000ms | __________ |
| Uptime | 99%+ | __________ |
| Error rate | 0% | __________ |

---

For more information, see:
- [README.md](README.md) - Full documentation
- [DEPLOYMENT-CHECKLIST.md](DEPLOYMENT-CHECKLIST.md) - Deployment verification
- [EXAMPLES.md](EXAMPLES.md) - Code examples
