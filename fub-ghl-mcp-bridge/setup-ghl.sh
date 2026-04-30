#!/bin/bash

# Setup script for GoHighLevel AI Agent Studio integration
# This script prepares the workflow configuration for GHL

set -e

echo "================================================"
echo "GoHighLevel AI Agent Studio Setup"
echo "================================================"
echo ""

# Check if config file exists
if [ ! -f "ghl-workflow-example.json" ]; then
    echo "❌ Error: ghl-workflow-example.json not found"
    exit 1
fi

echo "✓ Found ghl-workflow-example.json"
echo ""

# Display instructions
echo "INSTRUCTIONS:"
echo "================================================"
echo ""
echo "1. Go to GoHighLevel (https://app.gohighlevel.com)"
echo "2. Navigate to: Settings → Automations (or Workflows)"
echo "3. Click 'Create New' or 'Import Workflow'"
echo "4. Look for 'Import from JSON' option"
echo "5. Copy the configuration below"
echo "6. Paste it into the JSON import field"
echo "7. Click 'Import' or 'Create'"
echo ""
echo "================================================"
echo "CONFIGURATION TO COPY:"
echo "================================================"
echo ""

# Display the config file
cat ghl-workflow-example.json

echo ""
echo "================================================"
echo ""
echo "AFTER IMPORT:"
echo "  1. Find workflow: 'Sync FUB Lead to GHL'"
echo "  2. Click 'Test' or 'Run'"
echo "  3. Enter a FUB contact email (test@example.com)"
echo "  4. Watch it sync from FUB to GHL!"
echo ""
echo "Available workflows:"
echo "  • Sync FUB Lead to GHL"
echo "  • Sync FUB Deal to GHL Opportunity"
echo "  • Batch Sync FUB Contacts"
echo "  • Monitor FUB-GHL Bridge Health"
echo "  • Search FUB and Create GHL Contact"
echo ""
echo "✅ Setup complete!"
echo ""
