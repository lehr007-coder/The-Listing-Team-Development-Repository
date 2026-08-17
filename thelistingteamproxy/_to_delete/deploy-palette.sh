#!/bin/bash
set -e

WORKER_DIR="/Users/Scott/claude/projects/active/the-listing-team-development-repository/thelistingteamproxy"
cd "$WORKER_DIR"

echo "📋 Checking syntax..."
node --check worker.js || exit 1
echo "✓ Syntax valid"

echo ""
echo "🚀 Deploying to STAGING..."
npx wrangler deploy -c wrangler.staging.toml

echo ""
echo "✓ Staging deployment complete"
echo ""
echo "📍 Verify on staging:"
echo "   https://thelistingteamproxy-staging.lehr007.workers.dev/dashboard/ylopo-contacts"
echo ""
echo "Check:"
echo "   1. Click 'Buyer Intel' tab"
echo "   2. Scroll to 'Price Range Interest' chart"
echo "   3. Verify bars render with palette colors"
echo "   4. Toggle dark mode and verify colors adjust"
echo ""
read -p "Press ENTER after verifying staging looks good, or Ctrl+C to abort..."

echo ""
echo "🚀 Deploying to PRODUCTION..."
npx wrangler deploy

echo ""
echo "✓ Production deployment complete"
echo "📍 Live at: https://thelistingteamproxy.reallistingteam.com/dashboard/ylopo-contacts"
