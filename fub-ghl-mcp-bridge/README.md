# FUB-GHL MCP Bridge

A production-ready Model Context Protocol (MCP) server that bridges Follow Up Boss (FUB) and GoHighLevel (GHL), enabling safe bi-directional contact and opportunity synchronization.

## Features

- **Search Follow Up Boss Contacts**: Search by email, phone, or name
- **Retrieve FUB Contact Details**: Get comprehensive person data including stage, source, tags, and notes
- **Create/Update GHL Contacts**: Intelligent contact sync with duplicate detection
- **Sync FUB Persons to GHL**: Full person synchronization with automatic tagging
- **Create GHL Opportunities from FUB Deals**: Opportunity creation with deal tracking
- **Health Check**: Service status monitoring
- **Rate Limiting**: Built-in protection against abuse
- **Structured Logging**: Request tracking with secure error messages
- **Timeout Protection**: All API calls timeout after 15 seconds

## Architecture

```
Client (Claude / GHL AI Agent Studio)
          ↓
    MCP Protocol (JSON-RPC 2.0)
          ↓
   Cloudflare Worker (TypeScript)
          ↓
    ┌─────────────┬──────────────┐
    ↓             ↓
FUB API        GHL API
```

## Deployment

### Prerequisites

- Node.js 18+ and npm
- Wrangler CLI (`npm install -g wrangler`)
- Cloudflare account with Workers enabled
- FUB API credentials:
  - `FUB_API_KEY`
  - `FUB_X_SYSTEM`
  - `FUB_X_SYSTEM_KEY`
- GHL API credentials:
  - `GHL_PRIVATE_TOKEN`
  - `GHL_LOCATION_ID`

### Installation

1. **Clone and navigate to the project:**
   ```bash
   cd fub-ghl-mcp-bridge
   npm install
   ```

2. **Build the TypeScript:**
   ```bash
   npm run build
   ```

3. **Set environment secrets with Wrangler:**
   ```bash
   wrangler secret put FUB_API_KEY
   # Paste your FUB API key when prompted

   wrangler secret put FUB_X_SYSTEM
   # Paste your FUB X-System header value

   wrangler secret put FUB_X_SYSTEM_KEY
   # Paste your FUB X-System-Key header value

   wrangler secret put GHL_PRIVATE_TOKEN
   # Paste your GHL private token

   wrangler secret put GHL_LOCATION_ID
   # Paste your GHL location ID
   ```

4. **Deploy to Cloudflare Workers:**
   ```bash
   npm run deploy
   ```

   Or for production:
   ```bash
   npm run deploy:prod
   ```

5. **Verify deployment:**
   ```bash
   curl -X POST https://fub-ghl-mcp-bridge.example.com \
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
       "timestamp": "2024-12-01T12:00:00.000Z",
       "version": "1.0.0"
     }
   }
   ```

## Configuration

### Environment Variables

Available configuration via environment variables:

- `RATE_LIMIT_REQUESTS` (default: 100): Max requests per window
- `RATE_LIMIT_WINDOW` (default: 60): Time window in seconds
- `REQUEST_TIMEOUT` (default: 15000): Request timeout in milliseconds
- `LOG_LEVEL` (default: info): Logging level (debug, info, warn, error)

Update in `wrangler.toml` under `[vars]` section.

### Custom Domain (Optional)

Update `wrangler.toml` to use your custom domain:

```toml
[env.production]
name = "fub-ghl-mcp-bridge"
route = "https://your-domain.com/*"
zone_id = "your_cloudflare_zone_id"
```

## MCP Tools

### 1. search_fub_person

Search for Follow Up Boss contacts.

**Input Parameters:**
```typescript
{
  "email": "string (optional)",
  "phone": "string (optional)",
  "name": "string (optional)"
}
```

**Output:**
```typescript
{
  "persons": [
    {
      "id": "string",
      "email": "string",
      "phone": "string",
      "firstName": "string",
      "lastName": "string",
      "name": "string",
      "stage": "string",
      "source": "string",
      "tags": ["string"],
      "notes": "string",
      "assignedTo": "string",
      "createdAt": "ISO string",
      "updatedAt": "ISO string"
    }
  ],
  "count": "number"
}
```

**Example Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "search_fub_person",
  "params": {
    "email": "john@example.com"
  }
}
```

---

### 2. get_fub_person

Get detailed Follow Up Boss person information.

**Input Parameters:**
```typescript
{
  "personId": "string"
}
```

**Output:**
Returns complete FUBPerson object (see search_fub_person).

**Example Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "get_fub_person",
  "params": {
    "personId": "12345"
  }
}
```

---

### 3. create_or_update_ghl_contact

Create a new GHL contact or update an existing one (by email/phone match).

**Input Parameters:**
```typescript
{
  "firstName": "string (required)",
  "lastName": "string (required)",
  "email": "string (optional)",
  "phone": "string (optional)",
  "source": "string (optional, default: 'Follow Up Boss')",
  "tags": ["string"] (optional),
  "customFields": {} (optional)
}
```

**Output:**
```typescript
{
  "contactId": "string",
  "created": "boolean",
  "updated": "boolean"
}
```

**Example Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "create_or_update_ghl_contact",
  "params": {
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "phone": "+1234567890",
    "source": "Follow Up Boss",
    "tags": ["fub-sync", "lead"]
  }
}
```

---

### 4. sync_fub_person_to_ghl

Synchronize a Follow Up Boss person to GoHighLevel with automatic tagging and notes.

**Input Parameters:**
```typescript
{
  "personId": "string"
}
```

**Output:**
```typescript
{
  "personId": "string",
  "contactId": "string",
  "synced": "boolean",
  "created": "boolean",
  "updated": "boolean",
  "tagsApplied": ["string"]
}
```

**Tags Applied Automatically:**
- `fub-sync`: Always added
- `fub-imported`: Always added
- `fub-{stage}`: If person has a stage (e.g., `fub-lead`, `fub-prospect`)
- `fub-{source}`: If person has a source (e.g., `fub-website`, `fub-referral`)
- `fub-{personTag}`: For each tag on the FUB person

**Example Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "sync_fub_person_to_ghl",
  "params": {
    "personId": "12345"
  }
}
```

---

### 5. create_ghl_opportunity_from_fub_deal

Create a GoHighLevel opportunity from a Follow Up Boss deal.

**Input Parameters:**
```typescript
{
  "personId": "string (required)",
  "dealId": "string (optional)"
}
```

**Output:**
```typescript
{
  "opportunityId": "string",
  "created": "boolean",
  "updated": "boolean"
}
```

**Behavior:**
- First syncs the FUB person to GHL (if not already synced)
- Fetches deal details from FUB (if dealId provided)
- Checks for existing opportunities to avoid duplicates
- Stores FUB deal ID in custom field for future matching
- Adds sync note to opportunity

**Example Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "create_ghl_opportunity_from_fub_deal",
  "params": {
    "personId": "12345",
    "dealId": "67890"
  }
}
```

---

### 6. health_check

Check service status and connectivity.

**Input Parameters:**
```typescript
{}
```

**Output:**
```typescript
{
  "status": "ok" | "error",
  "service": "fub-ghl-mcp-bridge",
  "timestamp": "ISO string",
  "version": "string"
}
```

**Example Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "method": "health_check",
  "params": {}
}
```

## Integration with Claude

### Via Claude Code MCP Configuration

Add to your Claude Code MCP configuration (`.mcp.json` or `mcp_config.json`):

```json
{
  "mcpServers": {
    "fub-ghl-bridge": {
      "command": "npx",
      "args": ["wrangler", "dev"],
      "env": {
        "NODE_ENV": "development"
      }
    }
  },
  "tools": {
    "search_fub_person": {
      "description": "Search for Follow Up Boss contacts by email, phone, or name",
      "input_schema": {
        "type": "object",
        "properties": {
          "email": {"type": "string", "description": "Email address to search"},
          "phone": {"type": "string", "description": "Phone number to search"},
          "name": {"type": "string", "description": "Name to search"}
        }
      }
    },
    "sync_fub_person_to_ghl": {
      "description": "Synchronize a Follow Up Boss person to GoHighLevel",
      "input_schema": {
        "type": "object",
        "properties": {
          "personId": {"type": "string", "description": "Follow Up Boss person ID"}
        },
        "required": ["personId"]
      }
    }
  }
}
```

## Integration with GHL AI Agent Studio

### Step 1: Configure MCP Server URL

In your GHL AI Agent Studio settings, add the MCP bridge:

```
Server Type: HTTP
URL: https://fub-ghl-mcp-bridge.example.com
Authentication: None (if public) or Bearer token (if secured)
Timeout: 30000
```

### Step 2: Map Tools

Create tool mappings in your agent configuration:

```javascript
{
  "tools": [
    {
      "id": "search-fub-contacts",
      "name": "Search Follow Up Boss Contacts",
      "provider": "mcp",
      "action": "search_fub_person",
      "description": "Search for FUB contacts by email, phone, or name"
    },
    {
      "id": "sync-to-ghl",
      "name": "Sync FUB Person to GHL",
      "provider": "mcp",
      "action": "sync_fub_person_to_ghl",
      "description": "Synchronize a FUB person to GoHighLevel with tags"
    }
  ]
}
```

### Step 3: Add to Agent Workflows

Use the tools in your agent workflows:

```javascript
{
  "workflows": [
    {
      "name": "Sync FUB Lead to GHL",
      "trigger": "manual",
      "steps": [
        {
          "tool": "search-fub-contacts",
          "input": {"email": "{{contactEmail}}"}
        },
        {
          "tool": "sync-to-ghl",
          "input": {"personId": "{{result.persons[0].id}}"}
        }
      ]
    }
  ]
}
```

## Test Calls

### Using cURL

**Health Check:**
```bash
curl -X POST https://fub-ghl-mcp-bridge.example.com \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "health_check",
    "params": {}
  }'
```

**Search FUB Person:**
```bash
curl -X POST https://fub-ghl-mcp-bridge.example.com \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "search_fub_person",
    "params": {
      "email": "john@example.com"
    }
  }'
```

**Sync FUB Person to GHL:**
```bash
curl -X POST https://fub-ghl-mcp-bridge.example.com \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "sync_fub_person_to_ghl",
    "params": {
      "personId": "12345"
    }
  }'
```

**Create/Update GHL Contact:**
```bash
curl -X POST https://fub-ghl-mcp-bridge.example.com \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "create_or_update_ghl_contact",
    "params": {
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com",
      "phone": "+1234567890",
      "tags": ["fub-sync"]
    }
  }'
```

**Create GHL Opportunity from FUB Deal:**
```bash
curl -X POST https://fub-ghl-mcp-bridge.example.com \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 5,
    "method": "create_ghl_opportunity_from_fub_deal",
    "params": {
      "personId": "12345",
      "dealId": "67890"
    }
  }'
```

### Using Node.js

```javascript
async function callMCPBridge(method, params) {
  const response = await fetch('https://fub-ghl-mcp-bridge.example.com', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    }),
  });

  return response.json();
}

// Example usage
const result = await callMCPBridge('search_fub_person', {
  email: 'john@example.com',
});

console.log(result);
```

## Field Mapping: Follow Up Boss → GoHighLevel

| Follow Up Boss | GoHighLevel | Notes |
|---|---|---|
| `person.firstName` | `contact.firstName` | Mapped directly |
| `person.lastName` | `contact.lastName` | Mapped directly |
| `person.email` | `contact.email` | Mapped directly |
| `person.phone` | `contact.phone` | Mapped directly |
| `person.id` | `customFields.fubPersonId` | Stored for reference |
| `person.stage` | `tags: fub-{stage}` | Auto-tagged (e.g., fub-lead) |
| `person.source` | `tags: fub-{source}` | Auto-tagged (e.g., fub-website) |
| `person.tags` | `tags: fub-{tag}` | Each tag prefixed with "fub-" |
| `person.notes` | `customFields.fubNotes` | Stored in custom field |
| `deal.id` | `customFields.fubDealId` | Stored in opportunity |
| `deal.value` | `opportunity.value` | Mapped directly |
| `deal.name` | `opportunity.name` | Mapped directly |

## Security

### API Key Protection

- **No keys in logs**: Environment secrets never logged
- **No keys in responses**: All responses are sanitized
- **Secure headers**: Authorization headers properly formatted
- **HTTPS only**: All external API calls use HTTPS

### Input Validation

- Required fields validated before API calls
- Email/phone format validation
- String length limits enforced
- JSON schema validation on request

### Rate Limiting

- Per-IP rate limiting (default 100 req/60s)
- Configurable via environment variables
- Returns 429 Too Many Requests when exceeded
- Cleanup task removes old rate limit entries

### Error Handling

- Generic error messages returned to clients
- Detailed errors logged internally with requestId
- No sensitive data in error responses
- Timeout protection (15s default)

## Troubleshooting

### Deploy Issues

**Error: "Wrangler not found"**
```bash
npm install -g wrangler
```

**Error: "Invalid API credentials"**
- Verify all secrets are set correctly
- Check FUB API key format (should be alphanumeric)
- Verify GHL token and location ID are correct

### Runtime Issues

**Health check fails:**
```bash
# Check recent logs
wrangler tail

# Verify env vars
wrangler secret list
```

**Rate limit errors (429):**
- Reduce request frequency
- Increase `RATE_LIMIT_REQUESTS` environment variable
- Contact Cloudflare for rate limit adjustment

**Timeout errors (408):**
- Reduce request complexity
- Increase `REQUEST_TIMEOUT` (in milliseconds)
- Check network connectivity

### Debugging

Enable debug logging:

1. Update `wrangler.toml`:
   ```toml
   [vars]
   LOG_LEVEL = "debug"
   ```

2. Deploy changes:
   ```bash
   npm run deploy
   ```

3. View logs:
   ```bash
   wrangler tail --format pretty
   ```

## Monitoring

### Health Checks

Add to your monitoring system:

```bash
# Check every 5 minutes
*/5 * * * * curl -f https://fub-ghl-mcp-bridge.example.com/health || alert
```

### Logging

All requests logged with:
- Request ID (for tracing)
- Timestamp
- Method called
- Duration
- Error details (if any)

View with:
```bash
wrangler tail --env production
```

## Performance

- **Cold start**: ~50ms (Cloudflare Workers)
- **FUB search**: ~500-1000ms
- **GHL lookup**: ~300-700ms
- **Full sync**: ~1500-3000ms
- **Rate limit**: 100 requests per 60 seconds per IP

## Support

For issues or questions:

1. Check logs: `wrangler tail`
2. Test individually with cURL
3. Verify credentials in Cloudflare dashboard
4. Check Cloudflare Workers documentation

## License

MIT

## Changelog

### v1.0.0 (2024-12-01)

- Initial release
- 6 MCP tools implemented
- Rate limiting and security
- Cloudflare Workers deployment
- Full documentation
