# Quick Start - Deploy FUB-GHL MCP Bridge

## For Mac/Linux Users

### 1. Open Terminal

Press `Command + Space`, type `terminal`, press Enter.

### 2. Navigate to Project

Copy and paste this command:

```bash
cd ~/The-Listing-Team-Development-Repository/fub-ghl-mcp-bridge
```

Press Enter.

### 3. Run Deployment Script

```bash
chmod +x deploy.sh
./deploy.sh
```

The script will:
- ✅ Install dependencies
- ✅ Build TypeScript
- ✅ Install Wrangler globally
- ✅ Login to Cloudflare (if needed)
- ✅ Prompt for your 5 API credentials
- ✅ Deploy to Cloudflare Workers
- ✅ Show your live worker URL

### 4. What You Need to Provide

When prompted, paste these values (one at a time):

1. **FUB_API_KEY** - Your Follow Up Boss API key
   - Get from: https://app.followupboss.com/settings/integrations

2. **FUB_X_SYSTEM** - Your FUB X-System header value
   - Get from: https://app.followupboss.com/settings/integrations

3. **FUB_X_SYSTEM_KEY** - Your FUB X-System-Key header value
   - Get from: https://app.followupboss.com/settings/integrations

4. **GHL_PRIVATE_TOKEN** - Your GoHighLevel API token
   - Get from: https://app.gohighlevel.com/settings/integrations/api

5. **GHL_LOCATION_ID** - Your GoHighLevel location ID
   - Get from: https://app.gohighlevel.com/settings/

---

## For Windows Users

### 1. Open Command Prompt

Press `Windows Key + R`, type `cmd`, press Enter.

### 2. Navigate to Project

Copy and paste this command:

```cmd
cd The-Listing-Team-Development-Repository\fub-ghl-mcp-bridge
```

Press Enter.

### 3. Run Deployment Script

```cmd
deploy.bat
```

The script will guide you through the same steps as Mac/Linux.

---

## If Script Fails

If you encounter any errors, follow the **Manual Deployment** steps below.

---

## Manual Deployment (Step-by-Step)

### Prerequisites

- Node.js 18+ installed
- Cloudflare account

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Build

```bash
npm run build
```

### Step 3: Install Wrangler Globally

**Mac/Linux:**
```bash
sudo npm install -g wrangler
```

**Windows:**
```bash
npm install -g wrangler
```

### Step 4: Login to Cloudflare

```bash
wrangler login
```

This opens your browser. Log in with your Cloudflare account.

### Step 5: Set Secrets

Run each command and paste the value when prompted:

```bash
wrangler secret put FUB_API_KEY
# Paste your Follow Up Boss API key, press Enter
```

```bash
wrangler secret put FUB_X_SYSTEM
# Paste your FUB X-System value, press Enter
```

```bash
wrangler secret put FUB_X_SYSTEM_KEY
# Paste your FUB X-System-Key value, press Enter
```

```bash
wrangler secret put GHL_PRIVATE_TOKEN
# Paste your GoHighLevel token, press Enter
```

```bash
wrangler secret put GHL_LOCATION_ID
# Paste your GHL location ID, press Enter
```

### Step 6: Deploy

```bash
npm run deploy
```

You'll see output like:
```
✓ Uploaded fub-ghl-mcp-bridge
✓ Published to https://fub-ghl-mcp-bridge.example.workers.dev
```

---

## Verify Deployment

Test your worker with this curl command:

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

You should see:
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

## Troubleshooting

### "command not found: wrangler"

Install Wrangler globally:

**Mac/Linux:**
```bash
sudo npm install -g wrangler
```

**Windows:**
```bash
npm install -g wrangler
```

Then close and reopen terminal/command prompt.

### "Permission denied" on Mac

Use `sudo` for global installs:

```bash
sudo npm install -g wrangler
```

### "package.json not found"

Make sure you're in the correct directory:

```bash
pwd  # Should show: .../fub-ghl-mcp-bridge
ls   # Should show: README.md, src/, package.json, etc.
```

Navigate there with:

```bash
cd ~/The-Listing-Team-Development-Repository/fub-ghl-mcp-bridge
```

### "Invalid API credentials"

- Verify your credentials are correct
- Make sure you didn't accidentally copy extra spaces
- Paste each value one at a time
- Don't include quotes or backticks, just the value itself

### "Cloudflare login failed"

- Make sure you have a Cloudflare account
- You need a Worker enabled
- Go to: https://dash.cloudflare.com/

---

## Next Steps

After deployment:

1. **Update Custom Domain** (optional)
   - Edit `wrangler.toml`
   - Replace `example.com` with your domain
   - Redeploy: `npm run deploy`

2. **Integrate with Claude Code**
   - Add MCP server URL to your Claude Code config
   - See: [DEPLOYMENT.md](DEPLOYMENT.md#integration-with-claude-code)

3. **Integrate with GHL AI Agent Studio**
   - Add custom API integration
   - See: [DEPLOYMENT.md](DEPLOYMENT.md#integration-with-ghl-ai-agent-studio)

4. **Test the Tools**
   - See examples in: [EXAMPLES.md](EXAMPLES.md)
   - Try search_fub_person, sync_fub_person_to_ghl, etc.

---

## Documentation

- **README.md** - Complete documentation with all tool details
- **DEPLOYMENT.md** - Integration guides for Claude and GHL
- **EXAMPLES.md** - Code examples (cURL, JavaScript, Python)
- **FIELD-MAPPING.md** - Data field mapping reference

---

## Support

If you encounter issues:

1. Check your terminal/command prompt output for error messages
2. Review the **Troubleshooting** section above
3. Verify all 5 secrets are set: `wrangler secret list`
4. Check logs: `wrangler tail --format pretty`

Good luck! 🚀
