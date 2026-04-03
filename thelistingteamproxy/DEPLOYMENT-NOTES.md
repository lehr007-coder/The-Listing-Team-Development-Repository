# Deployment Notes - The Listing Team Proxy

## Secrets Required (Cloudflare Worker)

Worker name: `thelistingteamproxy`
Production URL: `https://thelistingteamproxy.reallistingteam.com`

### GHL_API_KEY
- **Use the PIT (Private Integration Token)**, NOT the JWT Location API Key
- JWT keys from GHL Business Profile are unreliable / expire frequently
- PIT format: `pit-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
- Found in: GHL > Settings > Integrations > Private Integrations
- Set with: `echo -n "pit-xxxxx" | npx wrangler secret put GHL_API_KEY --name thelistingteamproxy`
- **IMPORTANT**: Use `echo -n` to avoid trailing newline which causes auth failures

### GHL_V2_TOKEN
- Also the PIT token (same one)
- Used for Ylopo custom objects (v2 API)
- Set with: `echo -n "pit-xxxxx" | npx wrangler secret put GHL_V2_TOKEN --name thelistingteamproxy`

### GHL_LOCATION_ID
- Hardcoded as `SeZr4YCwEZ50IcWqylkQ` in worker.js (fallback)
- Can also be set as secret for override

## Deployment Commands

```bash
# Deploy (from directory with worker.js)
npx wrangler deploy worker.js --name thelistingteamproxy --compatibility-date 2024-01-01

# Or if wrangler.toml is present:
npx wrangler deploy
```

## Cache Behavior (Updated 2026-04-03)
- All client-side localStorage cache TTLs set to 0 (always fetch fresh)
- Server-side Ylopo events cache disabled (always fetches from GHL)
- Every page load pulls real-time data from GHL/Ylopo custom objects
- Field definitions cache kept at 30min (schema only, not data)

## Key Lesson Learned
- When setting Cloudflare Worker secrets, ALWAYS use `echo -n "value" | npx wrangler secret put SECRET_NAME`
- Interactive paste via `wrangler secret put` can add trailing newlines that silently break auth
