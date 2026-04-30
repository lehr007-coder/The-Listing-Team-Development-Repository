# Integration Setup Guide

This guide walks you through setting up the FUB-GHL MCP bridge with Claude Code and GoHighLevel AI Agent Studio.

---

## 🚀 Quick Setup (3 Steps)

### **Step 1: Run Integration Tests**

```bash
chmod +x test-integrations.sh
./test-integrations.sh
```

This verifies your MCP bridge is working correctly.

**Expected output:**
```
✓ PASS: health_check
✓ PASS: search_fub_person
✓ PASS: create_or_update_ghl_contact
✓ PASS: Error handling

✅ ALL TESTS PASSED!
```

---

### **Step 2: Setup Claude Code**

```bash
chmod +x setup-claude-code.sh
./setup-claude-code.sh
```

This displays your MCP configuration. Then:

1. **Copy the output** (the entire JSON config)
2. **Open Claude Code** app
3. **Settings → MCP Servers**
4. **Paste the config**
5. **Save and restart Claude Code**

**Test it:**
```
In Claude Code, ask:
"Search for john@example.com in Follow Up Boss"

Claude will use your MCP bridge to search!
```

---

### **Step 3: Setup GoHighLevel**

```bash
chmod +x setup-ghl.sh
./setup-ghl.sh
```

This displays your GHL workflow configuration. Then:

1. **Copy the output** (the entire JSON config)
2. **Open GoHighLevel** (https://app.gohighlevel.com)
3. **Settings → Automations → Create New/Import**
4. **Import from JSON**
5. **Paste the config**
6. **Click Import**

**Test it:**
```
In GHL:
1. Find workflow: "Sync FUB Lead to GHL"
2. Click Test
3. Enter email: test@example.com
4. Watch it sync!
```

---

## 📋 Complete Setup Checklist

### **Pre-Setup**
- [ ] MCP bridge deployed to Cloudflare
- [ ] All 5 secrets configured in Wrangler
- [ ] Health check responding (tested in Step 1)
- [ ] Monitoring running: `npm run monitor`

### **Claude Code Setup**
- [ ] Run: `./setup-claude-code.sh`
- [ ] Copy configuration output
- [ ] Open Claude Code Settings
- [ ] Navigate to MCP Servers section
- [ ] Paste configuration
- [ ] Save and restart Claude Code
- [ ] Test with sample FUB search

### **GHL Setup**
- [ ] Run: `./setup-ghl.sh`
- [ ] Copy configuration output
- [ ] Open GoHighLevel dashboard
- [ ] Navigate to Automations/Workflows
- [ ] Click Import from JSON
- [ ] Paste configuration
- [ ] Verify workflows imported
- [ ] Test "Sync FUB Lead to GHL" workflow

### **Integration Testing**
- [ ] Claude Code searches FUB successfully
- [ ] Claude Code syncs contacts to GHL
- [ ] GHL workflows execute without errors
- [ ] GHL workflows sync FUB → GHL contacts
- [ ] Tags are applied correctly in GHL
- [ ] Monitoring still running and healthy

### **Optional Enhancements**
- [ ] Set up Slack alerts for monitoring
- [ ] Configure custom domain (instead of workers.dev)
- [ ] Add webhook triggers in GHL
- [ ] Create additional custom workflows

---

## 🔄 Available Workflows in GHL

Once imported, you have these 5 workflows:

### **1. Sync FUB Lead to GHL**
- Trigger: Manual
- Input: Contact email
- Action: Search FUB, retrieve details, sync to GHL
- Output: GHL contact ID and applied tags
- Use case: Sync individual leads

### **2. Sync FUB Deal to GHL Opportunity**
- Trigger: Manual
- Input: FUB person ID and deal ID
- Action: Create GHL opportunity from FUB deal
- Output: GHL opportunity ID
- Use case: Convert FUB deals to GHL opportunities

### **3. Batch Sync FUB Contacts**
- Trigger: Scheduled (every 4 hours)
- Input: List of FUB person IDs
- Action: Sync multiple contacts in parallel
- Output: Count of synced contacts
- Use case: Automated daily syncs

### **4. Monitor FUB-GHL Bridge Health**
- Trigger: Scheduled (every 15 minutes)
- Input: None
- Action: Run health check on MCP bridge
- Output: Status, timestamp, response time
- Use case: Detect service issues early

### **5. Search FUB and Create GHL Contact**
- Trigger: Manual
- Input: Email, firstName, lastName
- Action: Search FUB, create GHL contact if not found
- Output: Success/failure message
- Use case: Fallback contact creation

---

## 🧪 Testing Individual Tools

### **Test Search FUB Person**
```bash
curl -X POST https://fub-ghl-mcp-bridge.lehr007.workers.dev \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"search_fub_person","params":{"email":"john@example.com"}}'
```

### **Test Get FUB Person**
```bash
curl -X POST https://fub-ghl-mcp-bridge.lehr007.workers.dev \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"get_fub_person","params":{"personId":"12345"}}'
```

### **Test Sync to GHL**
```bash
curl -X POST https://fub-ghl-mcp-bridge.lehr007.workers.dev \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"sync_fub_person_to_ghl","params":{"personId":"12345"}}'
```

### **Test Health Check**
```bash
curl -X POST https://fub-ghl-mcp-bridge.lehr007.workers.dev \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"health_check","params":{}}'
```

---

## 🆘 Troubleshooting

### **Setup Scripts Not Running**

Make them executable first:
```bash
chmod +x setup-claude-code.sh setup-ghl.sh test-integrations.sh
```

### **Tests Failing**

Check:
1. Worker is deployed: `https://fub-ghl-mcp-bridge.lehr007.workers.dev`
2. All 5 secrets are set: `wrangler secret list`
3. Recent logs: `wrangler tail --format pretty`
4. Rate limit: Try again in 1 minute

### **Claude Code Integration Not Working**

1. Verify config was pasted correctly
2. Restart Claude Code completely
3. Check for syntax errors in JSON config
4. Verify worker URL is correct in config

### **GHL Workflow Not Syncing**

1. Verify workflow was imported correctly
2. Check GHL API token is still valid
3. Verify location ID is correct
4. Review GHL workflow execution logs
5. Test with a known FUB contact

### **Monitoring Not Detecting Issues**

1. Verify monitoring script is running: `npm run monitor`
2. Check WORKER_URL is set: `echo $WORKER_URL`
3. Make sure not hitting rate limits
4. Check Slack webhook if configured

---

## 📊 Monitoring Your Integration

### **Start Monitoring**
```bash
export WORKER_URL=https://fub-ghl-mcp-bridge.lehr007.workers.dev
npm run monitor
```

### **View Logs**
```bash
wrangler tail --format pretty
```

### **Check Recent Performance**
```bash
npm run monitor
# Watch for 5 minutes to see response times and error rates
```

### **Setup Slack Alerts (Optional)**
```bash
export SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
npm run monitor
```

---

## ✅ Verification Checklist - Final

Run this checklist after completing all setup steps:

```bash
# 1. Verify worker is live
curl -s https://fub-ghl-mcp-bridge.lehr007.workers.dev | grep "ok" && echo "✓ Worker responding"

# 2. Verify Claude Code has the tools
echo "Try in Claude Code: 'Search for test@example.com in Follow Up Boss'"

# 3. Verify GHL workflows imported
echo "Check GHL Automations for 5 new workflows"

# 4. Run full test suite
./test-integrations.sh
```

---

## 🎉 You're Done!

Once all setup is complete:

✅ MCP bridge deployed and monitoring
✅ Claude Code can search FUB and sync to GHL
✅ GHL has automated workflows for syncing
✅ Both systems are connected and working

---

## 📚 Additional Resources

- [README.md](README.md) - Complete documentation
- [DEPLOYMENT.md](DEPLOYMENT.md) - Integration details
- [FIELD-MAPPING.md](FIELD-MAPPING.md) - Data mapping reference
- [EXAMPLES.md](EXAMPLES.md) - Code examples

---

## 🚀 Next Steps

1. **Customize workflows** - Modify GHL workflows for your business
2. **Add Slack alerts** - Get notifications of sync failures
3. **Monitor regularly** - Keep an eye on service health
4. **Document your flows** - Document which FUB → GHL mappings you use
5. **Scale up** - Use batch workflows for daily syncs

---

**All setup scripts are in this directory. Run them in order:**
1. `./test-integrations.sh`
2. `./setup-claude-code.sh`
3. `./setup-ghl.sh`

Good luck! 🚀
