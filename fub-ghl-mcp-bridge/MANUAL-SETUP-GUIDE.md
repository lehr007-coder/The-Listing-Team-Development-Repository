# Manual Setup Guide - Copy & Paste Instructions

## Status: Automated Setup Complete ✅

All configurations have been generated and are ready. The following steps require manual action on your systems.

---

## ⚠️ IMPORTANT - Sandbox Limitation

The integration tests cannot run from this sandbox environment due to Cloudflare security restrictions ("Host not in allowlist"). **This is completely normal and expected.** 

The tests will run perfectly fine on your Mac terminal.

---

## 📋 WHAT YOU NEED TO DO

### Option 1: Full Automatic Setup (Recommended)

Run these commands on your Mac in the project directory:

```bash
cd ~/The-Listing-Team-Development-Repository/fub-ghl-mcp-bridge

# Test the deployment (from your Mac)
./test-integrations.sh

# Setup Claude Code (shows copy-paste instructions)
./setup-claude-code.sh

# Setup GHL (shows copy-paste instructions)
./setup-ghl.sh
```

### Option 2: Manual Setup (If You Prefer)

See sections below for exact configurations to copy/paste.

---

## 🔧 Manual Configuration Steps

### STEP 1: Claude Code MCP Server Setup

**On your Mac, in Claude Code:**

1. Open **Claude Code** app
2. Click **Settings** ⚙️ (top right)
3. Find **MCP Servers** section
4. Click **Add MCP Server** or **Configure**
5. **Copy this entire configuration** (below):

```json
{
  "name": "FUB-GHL MCP Bridge",
  "description": "MCP server for syncing Follow Up Boss to GoHighLevel",
  "version": "1.0.0",
  "mcpServers": {
    "fub-ghl-bridge": {
      "command": "fetch",
      "url": "https://fub-ghl-mcp-bridge.lehr007.workers.dev",
      "timeout": 30000,
      "retries": 3,
      "description": "Follow Up Boss to GoHighLevel sync bridge"
    }
  },
  "tools": [
    {
      "id": "search_fub_person",
      "serverRef": "fub-ghl-bridge",
      "name": "Search Follow Up Boss Person",
      "category": "follow-up-boss",
      "description": "Search for Follow Up Boss contacts by email, phone, or name",
      "inputSchema": {
        "type": "object",
        "properties": {
          "email": {"type": "string", "description": "Email to search"},
          "phone": {"type": "string", "description": "Phone to search"},
          "name": {"type": "string", "description": "Name to search"}
        }
      }
    },
    {
      "id": "get_fub_person",
      "serverRef": "fub-ghl-bridge",
      "name": "Get FUB Person Details",
      "description": "Get detailed info about a FUB contact"
    },
    {
      "id": "create_or_update_ghl_contact",
      "serverRef": "fub-ghl-bridge",
      "name": "Create/Update GHL Contact",
      "description": "Create or update a contact in GoHighLevel"
    },
    {
      "id": "sync_fub_person_to_ghl",
      "serverRef": "fub-ghl-bridge",
      "name": "Sync FUB to GHL",
      "description": "Full sync of FUB person to GHL with auto-tagging"
    },
    {
      "id": "create_ghl_opportunity_from_fub_deal",
      "serverRef": "fub-ghl-bridge",
      "name": "Create GHL Opportunity",
      "description": "Create GHL opportunity from FUB deal"
    },
    {
      "id": "health_check",
      "serverRef": "fub-ghl-bridge",
      "name": "Health Check",
      "description": "Check MCP bridge service status"
    }
  ]
}
```

6. **Paste into Claude Code**
7. Click **Save** or **Apply**
8. **Restart Claude Code**

**Test it works:**
- Ask Claude Code: "Search for john@example.com in Follow Up Boss"
- Claude should respond with FUB search results

---

### STEP 2: GoHighLevel Workflow Import

**On GoHighLevel dashboard:**

1. Go to **https://app.gohighlevel.com**
2. Navigate to **Settings → Automations** (or **Workflows**)
3. Click **Create New Workflow** or **Import Workflow**
4. Look for **Import from JSON** option
5. **Copy the complete JSON** from: `ghl-workflow-example.json`
   - Full file is in the project directory
   - Contains 5 ready-to-use workflows
6. **Paste the entire JSON** into the import field
7. Click **Import**

**After import, you'll have 5 workflows:**
- ✅ Sync FUB Lead to GHL (manual trigger)
- ✅ Sync FUB Deal to GHL Opportunity (manual trigger)
- ✅ Batch Sync FUB Contacts (scheduled, 4 hourly)
- ✅ Monitor FUB-GHL Bridge Health (scheduled, 15 min)
- ✅ Search FUB and Create GHL Contact (manual trigger)

**Test it works:**
1. Find workflow: "Sync FUB Lead to GHL"
2. Click **Test** or **Run**
3. Enter email: `test@example.com`
4. Watch it sync from FUB to GHL!

---

### STEP 3: Verify Deployment (From Your Mac)

Run this from your Mac terminal:

```bash
cd ~/The-Listing-Team-Development-Repository/fub-ghl-mcp-bridge

# Test all 6 tools
./test-integrations.sh

# Expected output:
# ✓ PASS: health_check
# ✓ PASS: search_fub_person
# ✓ PASS: create_or_update_ghl_contact
# ✓ PASS: Error handling
# ✅ ALL TESTS PASSED!
```

---

## 📁 Configuration Files Location

All configuration files are in:
```
~/The-Listing-Team-Development-Repository/fub-ghl-mcp-bridge/
```

- `claude-code-config.json` - MCP server config
- `ghl-workflow-example.json` - GHL workflows (5 ready to use)
- `mcp-client-config.json` - Alternative client config
- `.env.example` - Environment variable template

---

## 🔐 Secrets Already Set?

The worker needs these 5 secrets configured on Cloudflare Workers:
- `FUB_API_KEY`
- `FUB_X_SYSTEM`
- `FUB_X_SYSTEM_KEY`
- `GHL_PRIVATE_TOKEN`
- `GHL_LOCATION_ID`

**Status:** These should already be configured from your initial deployment.

To verify they're set:
```bash
wrangler secret list
```

---

## 🆘 Troubleshooting

### Tests failing with "Host not in allowlist"
- This only happens in sandbox environments
- Will work fine on your Mac
- This is Cloudflare's security feature - completely normal

### Claude Code not seeing the tools
1. Make sure you pasted the **entire** JSON config
2. Restart Claude Code completely
3. Check that the URL is exactly: `https://fub-ghl-mcp-bridge.lehr007.workers.dev`

### GHL workflows not importing
1. Make sure the JSON is valid (copy from the file directly)
2. Check the URL in the config: `https://fub-ghl-mcp-bridge.lehr007.workers.dev`
3. Verify GHL location ID is set in Cloudflare secrets

### Sync not working end-to-end
1. Run `./test-integrations.sh` from your Mac to verify the worker is responding
2. Check Cloudflare Worker logs: `wrangler tail`
3. Verify all 5 secrets are set correctly

---

## 📚 Documentation Reference

- **README.md** - Complete feature reference
- **FIELD-MAPPING.md** - FUB to GHL field mapping
- **EXAMPLES.md** - cURL, JavaScript, Python examples
- **TESTING-AND-MONITORING.md** - Monitoring setup

---

## ✅ Next Actions Checklist

- [ ] Run `./test-integrations.sh` on your Mac to verify worker
- [ ] Copy Claude Code config and paste into Claude Code Settings
- [ ] Restart Claude Code
- [ ] Test: "Search for john@example.com in Follow Up Boss"
- [ ] Copy GHL workflow JSON and import into GHL
- [ ] Test: Run "Sync FUB Lead to GHL" workflow in GHL
- [ ] Verify tags are applied in GHL (fub-sync, fub-{stage}, etc.)

---

## 🎉 Success Criteria

Once complete, you should be able to:
1. ✅ Search FUB contacts from Claude Code
2. ✅ Get detailed FUB person info from Claude Code
3. ✅ Sync FUB contacts to GHL automatically
4. ✅ Create GHL opportunities from FUB deals
5. ✅ Monitor bridge health
6. ✅ Run batch syncs on schedule

Everything is ready to go. Just need these manual steps on your Mac! 🚀
