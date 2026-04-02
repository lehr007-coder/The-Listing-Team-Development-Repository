#!/bin/bash
# Deploy script for thelistingteamproxy
# Usage:
#   ./deploy.sh staging    - Deploy to staging (test environment)
#   ./deploy.sh production - Deploy to live (after testing)
#   ./deploy.sh promote    - Copy staging code to production

set -e

if [ "$1" = "staging" ]; then
  echo "=== Deploying to STAGING ==="
  echo "Worker: thelistingteamproxy-staging"
  echo "URL: https://thelistingteamproxy-staging.lehr007.workers.dev"
  echo ""
  npx wrangler deploy --config wrangler.staging.toml
  echo ""
  echo "=== STAGING deployed! Test at: ==="
  echo "  https://thelistingteamproxy-staging.lehr007.workers.dev/health"
  echo "  https://thelistingteamproxy-staging.lehr007.workers.dev/dashboard"

elif [ "$1" = "production" ]; then
  echo "=== Deploying to PRODUCTION (LIVE) ==="
  echo "Worker: thelistingteamproxy"
  echo "URL: https://thelistingteamproxy.reallistingteam.com"
  echo ""
  read -p "Are you sure? This affects LIVE users. (y/N): " confirm
  if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
    npx wrangler deploy
    echo ""
    echo "=== PRODUCTION deployed! ==="
  else
    echo "Cancelled."
  fi

elif [ "$1" = "secrets" ]; then
  echo "=== Setting secrets on STAGING ==="
  echo "Paste JWT Location API Key:"
  npx wrangler secret put GHL_API_KEY --config wrangler.staging.toml
  echo "Paste PIT token:"
  npx wrangler secret put GHL_V2_TOKEN --config wrangler.staging.toml
  echo "=== Secrets set on staging! ==="

else
  echo "Usage:"
  echo "  ./deploy.sh staging     - Deploy to test environment"
  echo "  ./deploy.sh production  - Deploy to live (with confirmation)"
  echo "  ./deploy.sh secrets     - Set secrets on staging worker"
fi
