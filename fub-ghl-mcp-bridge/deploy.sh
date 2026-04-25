#!/bin/bash

# FUB-GHL MCP Bridge - Automated Deployment Script
# This script automates the deployment process for Mac/Linux

set -e  # Exit on any error

echo "================================================"
echo "FUB-GHL MCP Bridge - Deployment Script"
echo "================================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: package.json not found${NC}"
    echo "Make sure you're in the fub-ghl-mpc-bridge directory:"
    echo "  cd The-Listing-Team-Development-Repository/fub-ghl-mcp-bridge"
    exit 1
fi

echo -e "${GREEN}✓ Found package.json - correct directory${NC}"
echo ""

# Step 1: Install dependencies
echo -e "${YELLOW}Step 1: Installing dependencies...${NC}"
npm install
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

# Step 2: Build TypeScript
echo -e "${YELLOW}Step 2: Building TypeScript...${NC}"
npm run build
echo -e "${GREEN}✓ Build complete${NC}"
echo ""

# Step 3: Install Wrangler globally
echo -e "${YELLOW}Step 3: Installing Wrangler CLI...${NC}"
sudo npm install -g wrangler
echo -e "${GREEN}✓ Wrangler installed${NC}"
echo ""

# Step 4: Check if already logged in
echo -e "${YELLOW}Step 4: Checking Cloudflare authentication...${NC}"
if wrangler whoami &> /dev/null; then
    echo -e "${GREEN}✓ Already authenticated with Cloudflare${NC}"
else
    echo -e "${YELLOW}Need to authenticate with Cloudflare...${NC}"
    wrangler login
fi
echo ""

# Step 5: Set secrets
echo -e "${YELLOW}Step 5: Setting environment secrets${NC}"
echo "You'll be prompted to paste each secret value."
echo ""

read -p "Enter FUB_API_KEY: " fub_api_key
echo "$fub_api_key" | wrangler secret put FUB_API_KEY
echo -e "${GREEN}✓ FUB_API_KEY set${NC}"

read -p "Enter FUB_X_SYSTEM: " fub_x_system
echo "$fub_x_system" | wrangler secret put FUB_X_SYSTEM
echo -e "${GREEN}✓ FUB_X_SYSTEM set${NC}"

read -p "Enter FUB_X_SYSTEM_KEY: " fub_x_system_key
echo "$fub_x_system_key" | wrangler secret put FUB_X_SYSTEM_KEY
echo -e "${GREEN}✓ FUB_X_SYSTEM_KEY set${NC}"

read -p "Enter GHL_PRIVATE_TOKEN: " ghl_private_token
echo "$ghl_private_token" | wrangler secret put GHL_PRIVATE_TOKEN
echo -e "${GREEN}✓ GHL_PRIVATE_TOKEN set${NC}"

read -p "Enter GHL_LOCATION_ID: " ghl_location_id
echo "$ghl_location_id" | wrangler secret put GHL_LOCATION_ID
echo -e "${GREEN}✓ GHL_LOCATION_ID set${NC}"

echo ""

# Step 6: Deploy
echo -e "${YELLOW}Step 6: Deploying to Cloudflare Workers...${NC}"
npm run deploy
echo -e "${GREEN}✓ Deployment complete!${NC}"
echo ""

# Step 7: Test
echo -e "${YELLOW}Step 7: Testing deployment...${NC}"
echo "Your worker is now deployed!"
echo ""
echo "To test your deployment, run:"
echo "  curl -X POST https://fub-ghl-mcp-bridge.example.workers.dev \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"jsonrpc\": \"2.0\", \"id\": 1, \"method\": \"health_check\", \"params\": {}}'"
echo ""

echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}🎉 Deployment successful!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo "Next steps:"
echo "1. Update your custom domain in wrangler.toml (optional)"
echo "2. Test the health endpoint with the curl command above"
echo "3. Integrate with Claude Code or GHL AI Agent Studio"
echo ""
echo "Documentation:"
echo "  - README.md - Complete documentation"
echo "  - DEPLOYMENT.md - Integration guides"
echo "  - EXAMPLES.md - Code examples"
