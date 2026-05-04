# Quick Copy & Paste - 3 Easy Steps

## Step 1️⃣: Claude Code Setup (2 minutes)

**On your Mac, open Claude Code:**

1. Click **⚙️ Settings** (top right)
2. Find **MCP Servers** section
3. Click **Add** or **Configure**
4. **Copy the entire content** from this file: `CLAUDE-CODE-CONFIG-READY.json`
5. **Paste it** into Claude Code
6. Click **Save**
7. **Restart** Claude Code

**Test it:** Ask Claude "Search for test@example.com in Follow Up Boss"

---

## Step 2️⃣: GoHighLevel Setup (3 minutes)

**On GoHighLevel (https://app.gohighlevel.com):**

1. Go to **Settings → Automations** (or **Workflows**)
2. Click **Import Workflow** or **Create New**
3. Select **Import from JSON**
4. **Copy the entire content** from: `GHL-WORKFLOWS-READY.json`
5. **Paste it** into GHL
6. Click **Import** or **Create**

**Test it:** 
- Find workflow: "Sync FUB Lead to GHL"
- Click **Test**
- Enter: `test@example.com`
- Watch it sync!

---

## Step 3️⃣: Verify Everything (1 minute)

**On your Mac terminal:**

```bash
cd ~/The-Listing-Team-Development-Repository/fub-ghl-mcp-bridge
./test-integrations.sh
```

**Expected output:**
```
✓ PASS: health_check
✓ PASS: search_fub_person
✓ PASS: create_or_update_ghl_contact
✓ PASS: Error handling
✅ ALL TESTS PASSED!
```

---

## 🎯 That's it! You're done!

Everything is now connected:
- ✅ Claude Code can search FUB and sync to GHL
- ✅ GHL workflows automate FUB syncs
- ✅ Both systems monitor health automatically

---

## 📁 Files Ready to Copy

| File | Purpose |
|------|---------|
| `CLAUDE-CODE-CONFIG-READY.json` | Copy into Claude Code Settings |
| `GHL-WORKFLOWS-READY.json` | Copy/import into GHL Automations |
| `test-integrations.sh` | Run on Mac to verify everything |

---

## ❓ Questions?

See these docs for more info:
- `MANUAL-SETUP-GUIDE.md` - Detailed step-by-step
- `README.md` - Complete feature reference
- `FIELD-MAPPING.md` - See what FUB fields map to GHL
- `EXAMPLES.md` - Code examples in multiple languages
