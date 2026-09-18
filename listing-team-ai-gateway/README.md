# Listing Team AI Gateway

Cloudflare Worker that consolidates existing Listing Team MCP/REST capabilities behind one authenticated tool interface.

## Current tool namespaces

- `realestate.*` — IDX search, valuation, CMA, lead lookup, agent insights
- `property.*` — area/school/walkability/tax enrichment
- `finance.*` — mortgage estimate
- `voice.*` — returning caller context, lead scoring, call-quality review

The first release intentionally does **not** expose destructive CRM or website-write tools. Add those later behind separate permissions/tokens.

## Interfaces

### Health

`GET /health`

Returns which upstream integrations have base URLs configured. It does not expose secrets.

### REST tools

`GET /tools` with `Authorization: Bearer <GATEWAY_AUTH_TOKEN>` lists tools.

`POST /tool/<tool-name>` invokes a tool with a JSON body.

Example:

```bash
curl -X POST 'https://listing-team-ai-gateway.<subdomain>.workers.dev/tool/realestate.search_listings' \
  -H 'Authorization: Bearer <GATEWAY_AUTH_TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"city":"Fort Lauderdale","beds":3,"maxPrice":900000,"idxStatus":"active"}'
```

### MCP-style JSON-RPC

`POST /mcp` accepts:

- `initialize`
- `tools/list`
- `tools/call`

Example tool list:

```json
{"jsonrpc":"2.0","id":1,"method":"tools/list"}
```

Example call:

```json
{
  "jsonrpc":"2.0",
  "id":2,
  "method":"tools/call",
  "params": {
    "name":"finance.estimate_mortgage",
    "arguments":{"price":625000,"down_payment_pct":20,"loan_term_years":30}
  }
}
```

## Configure

```bash
cd listing-team-ai-gateway
npm install

npx wrangler secret put GATEWAY_AUTH_TOKEN
npx wrangler secret put IDX_BRIDGE_AUTH_TOKEN
npx wrangler secret put VOICE_BRIDGE_AUTH_TOKEN
```

Set the deployed upstream Worker URLs in `wrangler.toml`:

- `IDX_BRIDGE_BASE_URL`
- `PROPERTY_DATA_BASE_URL`
- `MORTGAGE_BASE_URL`
- `RETURNING_CALLER_BASE_URL`
- `LEAD_SCORER_BASE_URL`
- `CALL_QUALITY_BASE_URL`

Then:

```bash
npm run typecheck
npm run deploy
```

## Security model

1. Gateway requires `GATEWAY_AUTH_TOKEN` for `/tools`, `/tool/*`, and `/mcp`.
2. Upstream bridge credentials remain Cloudflare secrets and are never returned to callers.
3. Public `/health` only reports whether an integration is configured.
4. `create_lead`, saved-search creation, SMS/email sending, CRM updates, Squarespace publishing, deletion, and similar writes are deliberately excluded from v0.1.
5. Add a second authorization tier before enabling write-capable tools.

## Next phase

- Add read-only GoHighLevel contact/conversation/opportunity tools.
- Validate Squarespace API operations against the live API before exposing them.
- Add a write-token tier for approved CRM/site mutations.
- Add Cloudflare Access/service-token enforcement in front of the Worker.
- Add request audit logging and optional rate limiting.
