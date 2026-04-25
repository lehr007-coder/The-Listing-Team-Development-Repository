# FUB-GHL MCP Bridge - Deployment & Integration Guide

## Quick Start Deployment

### Step 1: Install Dependencies

```bash
cd fub-ghl-mcp-bridge
npm install
```

### Step 2: Build TypeScript

```bash
npm run build
```

Verify build succeeded:
```bash
ls -la dist/
```

### Step 3: Authenticate with Cloudflare

```bash
wrangler login
```

This opens a browser window to authenticate. Follow the prompts.

### Step 4: Set Environment Secrets

Set each secret individually (they won't be stored in files):

```bash
wrangler secret put FUB_API_KEY
# Paste your Follow Up Boss API key and press Enter
# Get from: https://app.followupboss.com/settings/integrations

wrangler secret put FUB_X_SYSTEM
# Paste your FUB X-System header value

wrangler secret put FUB_X_SYSTEM_KEY
# Paste your FUB X-System-Key header value

wrangler secret put GHL_PRIVATE_TOKEN
# Paste your GoHighLevel API token
# Get from: https://app.gohighlevel.com/settings/integrations/api

wrangler secret put GHL_LOCATION_ID
# Paste your GoHighLevel location ID
# Get from: https://app.gohighlevel.com/settings/
```

### Step 5: Deploy to Cloudflare Workers

```bash
npm run deploy
```

Output will show your worker URL:
```
✓ Uploaded fub-ghl-mcp-bridge
✓ Published to https://fub-ghl-mcp-bridge.example.workers.dev
```

### Step 6: Test the Deployment

```bash
curl -X POST https://fub-ghl-mcp-bridge.example.workers.dev \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "health_check",
    "params": {}
  }'
```

Expected response:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "status": "ok",
    "service": "fub-ghl-mcp-bridge",
    "timestamp": "2024-12-01T...",
    "version": "1.0.0"
  }
}
```

---

## Custom Domain Setup (Optional)

### Step 1: Add Domain to Cloudflare

1. Add your domain to Cloudflare dashboard
2. Update nameservers with registrar
3. Wait for DNS propagation

### Step 2: Update wrangler.toml

```toml
[env.production]
name = "fub-ghl-mcp-bridge"
route = "https://mcp-bridge.yourdomain.com/*"
zone_id = "your_cloudflare_zone_id"  # From dashboard

[[env.production.routes]]
pattern = "mcp-bridge.yourdomain.com/*"
zone_name = "yourdomain.com"
```

### Step 3: Deploy to Production

```bash
npm run deploy:prod
```

---

## Integration with Claude Code

### Method 1: Local Development Mode

For development or testing with Claude Code:

```bash
# In the fub-ghl-mcp-bridge directory
npm run dev
```

This starts a local server at `http://localhost:8787`.

### Method 2: Remote Worker URL

Add to your Claude Code settings or project configuration:

```json
{
  "mcpServers": {
    "fub-ghl-bridge": {
      "url": "https://fub-ghl-mcp-bridge.example.workers.dev",
      "timeout": 30000,
      "tools": [
        "search_fub_person",
        "get_fub_person",
        "create_or_update_ghl_contact",
        "sync_fub_person_to_ghl",
        "create_ghl_opportunity_from_fub_deal",
        "health_check"
      ]
    }
  }
}
```

### Method 3: Claude Agent SDK Integration

If using Claude Agent SDK with your own hosting:

```javascript
import { Client } from "@anthropic-ai/sdk";

const client = new Client();

// Configure MCP server
const mcpServerUrl = "https://fub-ghl-mcp-bridge.example.workers.dev";

const response = await client.messages.create({
  model: "claude-opus-4-1",
  max_tokens: 1024,
  tools: [
    {
      type: "mcp",
      name: "sync_fub_person_to_ghl",
      description: "Sync a FUB person to GoHighLevel",
      schema: {
        type: "object",
        properties: {
          personId: {
            type: "string",
            description: "Follow Up Boss person ID",
          },
        },
        required: ["personId"],
      },
    },
  ],
  messages: [
    {
      role: "user",
      content: "Sync person ABC123 from FUB to GHL",
    },
  ],
});
```

---

## Integration with GHL AI Agent Studio

### Step 1: Add MCP Server to GHL

In GHL Dashboard → Integrations → AI Agent Studio:

1. Click "Add Tool"
2. Select "Custom API"
3. Configure:

```
Name: FUB-GHL Bridge
Type: HTTP
URL: https://fub-ghl-mcp-bridge.example.workers.dev
Authentication: None (if public) or Bearer token
Timeout: 30000ms
Protocol: JSON-RPC 2.0
```

### Step 2: Create Tool Mappings

Create custom tools in your agent:

```javascript
{
  "tools": [
    {
      "id": "search-fub",
      "name": "Search Follow Up Boss",
      "category": "crm",
      "provider": "mcp",
      "endpoint": "https://fub-ghl-mcp-bridge.example.workers.dev",
      "method": "search_fub_person",
      "description": "Search for contacts in Follow Up Boss",
      "inputSchema": {
        "type": "object",
        "properties": {
          "email": {
            "type": "string",
            "description": "Email to search"
          },
          "phone": {
            "type": "string",
            "description": "Phone to search"
          },
          "name": {
            "type": "string",
            "description": "Name to search"
          }
        }
      }
    },
    {
      "id": "sync-to-ghl",
      "name": "Sync FUB to GHL",
      "category": "crm",
      "provider": "mcp",
      "endpoint": "https://fub-ghl-mcp-bridge.example.workers.dev",
      "method": "sync_fub_person_to_ghl",
      "description": "Synchronize FUB person to GHL",
      "inputSchema": {
        "type": "object",
        "properties": {
          "personId": {
            "type": "string",
            "description": "FUB person ID"
          }
        },
        "required": ["personId"]
      }
    }
  ]
}
```

### Step 3: Use in Agent Workflows

Create workflows that use the MCP tools:

```javascript
{
  "workflows": [
    {
      "id": "sync-fub-lead",
      "name": "Sync FUB Lead to GHL",
      "description": "Find a FUB lead and sync to GHL",
      "trigger": "manual",
      "steps": [
        {
          "type": "tool",
          "toolId": "search-fub",
          "input": {
            "email": "{{contactEmail}}"
          },
          "outputVar": "fubSearchResults"
        },
        {
          "type": "condition",
          "condition": "fubSearchResults.count > 0",
          "then": [
            {
              "type": "tool",
              "toolId": "sync-to-ghl",
              "input": {
                "personId": "{{fubSearchResults.persons[0].id}}"
              },
              "outputVar": "syncResult"
            },
            {
              "type": "action",
              "action": "sendMessage",
              "message": "Successfully synced {{syncResult.contactId}} to GHL"
            }
          ],
          "else": [
            {
              "type": "action",
              "action": "sendMessage",
              "message": "Contact not found in Follow Up Boss"
            }
          ]
        }
      ]
    }
  ]
}
```

### Step 4: Test in GHL Agent Studio

1. Go to Agents → Your Agent
2. Test the workflow:
   - Click "Test Workflow"
   - Provide test data (email, phone, etc.)
   - Verify MCP bridge responds correctly

---

## Monitoring & Logging

### View Logs

```bash
# Real-time logs
wrangler tail

# Formatted output
wrangler tail --format pretty

# Filter by status
wrangler tail --status error
```

### Log Examples

**Successful sync:**
```
[2024-12-01T12:00:00.000Z] [INFO] Syncing FUB person to GHL {"requestId":"req_123_abc","personId":"abc123"}
[2024-12-01T12:00:01.500Z] [INFO] FUB person synced to GHL {"requestId":"req_123_abc","personId":"abc123","contactId":"ghl_xyz"}
```

**Rate limit hit:**
```
[2024-12-01T12:00:02.000Z] [WARN] Rate limit exceeded {"requestId":"req_124_def","clientIp":"192.168.1.1"}
```

**API error:**
```
[2024-12-01T12:00:03.000Z] [ERROR] FUB search failed {"requestId":"req_125_ghi","status":401,"error":"Unauthorized"}
```

---

## Troubleshooting Deployment

### Issue: "Wrangler not found"

```bash
npm install -g wrangler
wrangler --version
```

### Issue: "Invalid API credentials"

1. Verify credentials in Cloudflare dashboard:
   ```bash
   wrangler secret list
   ```

2. Check API key format:
   - FUB_API_KEY should be alphanumeric
   - GHL_PRIVATE_TOKEN should start with correct prefix

3. Re-set secrets if needed:
   ```bash
   wrangler secret delete FUB_API_KEY
   wrangler secret put FUB_API_KEY
   ```

### Issue: "Health check returns error"

Check for:
1. Network connectivity to FUB/GHL APIs
2. API key validity (may have expired)
3. Location ID is correct in GHL

Test directly:
```bash
curl -v https://fub-ghl-mcp-bridge.example.workers.dev
```

### Issue: "Rate limit errors in production"

Increase rate limits:

1. Update `wrangler.toml`:
   ```toml
   [vars]
   RATE_LIMIT_REQUESTS = "500"  # Increase from 100
   RATE_LIMIT_WINDOW = "60"
   ```

2. Redeploy:
   ```bash
   npm run deploy
   ```

### Issue: "Timeout errors"

Increase timeout:

1. Update `wrangler.toml`:
   ```toml
   [vars]
   REQUEST_TIMEOUT = "30000"  # Increase from 15000
   ```

2. Redeploy

### Issue: "Cloudflare Worker size exceeded"

This shouldn't happen, but if it does:

1. Check bundle size:
   ```bash
   npm run build
   ls -lh dist/index.js
   ```

2. Verify dependencies are correctly bundled (no node_modules in dist)

---

## Performance Optimization

### Response Times

Typical response times (from client):
- Health check: 50-100ms
- Search: 500-1500ms
- Sync: 1500-3000ms

### Optimizing Slow Syncs

If syncs are slow:

1. **Enable debug logging** to find bottleneck:
   ```bash
   # Update wrangler.toml
   LOG_LEVEL = "debug"
   npm run deploy
   ```

2. **Profile API calls**:
   - Check FUB API response times
   - Check GHL API response times
   - Increase timeout if needed

3. **Batch operations** instead of individual syncs

### Caching (Future Enhancement)

Consider adding caching for repeated searches:
- Cache search results for 5-10 minutes
- Cache person details for 1 hour
- Invalidate on sync

---

## Security Checklist

- [ ] All secrets set via Wrangler (not in files)
- [ ] HTTPS enforced on custom domain
- [ ] Rate limiting enabled (100 req/60s)
- [ ] Logs don't contain API keys
- [ ] Error messages are generic
- [ ] CORS configured if needed
- [ ] API key rotation schedule set

---

## Maintenance Tasks

### Weekly
- Monitor error logs
- Check rate limit usage
- Verify health checks pass

### Monthly
- Review sync statistics
- Check for API deprecations
- Test disaster recovery

### Quarterly
- Update dependencies
- Review security settings
- Capacity planning

---

## Rollback Procedure

If deployment causes issues:

```bash
# View deployment history
wrangler deployments list

# Rollback to previous version
wrangler rollback

# Or deploy specific version
wrangler deploy --compatibility-date 2024-11-01
```

---

## Support

For deployment issues:
1. Check logs: `wrangler tail --format pretty`
2. Test health endpoint
3. Verify all secrets are set: `wrangler secret list`
4. Check Cloudflare Workers status: https://www.cloudflarestatus.com

For integration issues with Claude/GHL:
1. Verify MCP server is running
2. Test with cURL first
3. Check tool configuration in agent settings
4. Review error messages in MCP logs

---

For more information, see:
- [README.md](README.md) - Complete documentation
- [EXAMPLES.md](EXAMPLES.md) - Code examples
- [FIELD-MAPPING.md](FIELD-MAPPING.md) - Data mapping details
