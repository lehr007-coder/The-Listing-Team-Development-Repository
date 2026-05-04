#!/bin/bash

# Setup script for Claude Code integration
# This script prepares the MCP configuration for Claude Code

set -e

echo "================================================"
echo "Claude Code MCP Setup"
echo "================================================"
echo ""

# Check if config file exists
if [ ! -f "claude-code-config.json" ]; then
    echo "❌ Error: claude-code-config.json not found"
    exit 1
fi

echo "✓ Found claude-code-config.json"
echo ""

# Display instructions
echo "INSTRUCTIONS:"
echo "================================================"
echo ""
echo "1. Open Claude Code app"
echo "2. Click Settings (⚙️ gear icon)"
echo "3. Look for 'MCP Servers' or 'Tools' section"
echo "4. Copy the configuration below"
echo "5. Paste it into Claude Code settings"
echo "6. Save and restart Claude Code"
echo ""
echo "================================================"
echo "CONFIGURATION TO COPY:"
echo "================================================"
echo ""

# Display the config file
cat claude-code-config.json

echo ""
echo "================================================"
echo ""
echo "After pasting in Claude Code, you can test by:"
echo "  - Asking: 'Search for john@example.com in Follow Up Boss'"
echo "  - Claude will use your MCP bridge!"
echo ""
echo "✅ Setup complete!"
echo ""
