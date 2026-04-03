#!/bin/bash
# Deploy script for thelistingteamproxy
# Usage:
#   ./deploy.sh staging    - Deploy to staging (test environment)
#   ./deploy.sh production - Deploy to live (after testing)
#   ./deploy.sh promote    - Copy staging worker.js to production (after testing)
#   ./deploy.sh secrets    - Set secrets on both staging and production
#   ./deploy.sh status     - Check health of both environments

set -e
WORKER_FILE="worker.js"
PROD_NAME="thelistingteamproxy"
STAGING_NAME="thelistingteamproxy-staging"
COMPAT_DATE="2024-01-01"

if [ "$1" = "staging" ]; then
  echo "=== Deploying to STAGING ==="
  echo "Worker: $STAGING_NAME"
  echo "URL: https://$STAGING_NAME.lehr007.workers.dev"
  echo ""
  npx wrangler deploy "$WORKER_FILE" --name "$STAGING_NAME" --compatibility-date "$COMPAT_DATE"
  echo ""
  echo "=== STAGING deployed! Test at: ==="
  echo "  https://$STAGING_NAME.lehr007.workers.dev/health"
  echo "  https://$STAGING_NAME.lehr007.workers.dev/dashboard/ylopo-contacts"

elif [ "$1" = "production" ] || [ "$1" = "live" ]; then
  echo "=== Deploying to PRODUCTION (LIVE) ==="
  echo "Worker: $PROD_NAME"
  echo "URL: https://thelistingteamproxy.reallistingteam.com"
  echo ""
  read -p "Are you sure? This affects LIVE users. (y/N): " confirm
  if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
    npx wrangler deploy "$WORKER_FILE" --name "$PROD_NAME" --compatibility-date "$COMPAT_DATE"
    echo ""
    echo "=== PRODUCTION deployed! ==="
    echo "  https://thelistingteamproxy.reallistingteam.com/health"
  else
    echo "Cancelled."
  fi

elif [ "$1" = "promote" ]; then
  echo "=== PROMOTE: Deploying current worker.js to PRODUCTION ==="
  echo ""
  echo "This will deploy the same worker.js that is on staging to production."
  echo "Worker: $PROD_NAME"
  echo "URL: https://thelistingteamproxy.reallistingteam.com"
  echo ""
  # Verify staging is healthy first
  echo "Checking staging health..."
  STAGING_HEALTH=$(curl -s "https://$STAGING_NAME.lehr007.workers.dev/health" 2>/dev/null)
  if echo "$STAGING_HEALTH" | grep -q '"ok":true'; then
    echo "  Staging is healthy."
  else
    echo "  WARNING: Staging health check failed!"
    echo "  Response: $STAGING_HEALTH"
    read -p "Continue anyway? (y/N): " cont
    if [ "$cont" != "y" ] && [ "$cont" != "Y" ]; then
      echo "Cancelled."
      exit 1
    fi
  fi
  echo ""
  read -p "Deploy to production? (y/N): " confirm
  if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
    npx wrangler deploy "$WORKER_FILE" --name "$PROD_NAME" --compatibility-date "$COMPAT_DATE"
    echo ""
    echo "=== PRODUCTION deployed! ==="
    echo "  https://thelistingteamproxy.reallistingteam.com/health"
  else
    echo "Cancelled."
  fi

elif [ "$1" = "secrets" ]; then
  echo "=== Setting secrets ==="
  echo ""
  read -p "Paste your PIT token (pit-xxxxx): " PIT_TOKEN
  echo ""

  echo "Setting secrets on STAGING..."
  echo -n "$PIT_TOKEN" | npx wrangler secret put GHL_API_KEY --name "$STAGING_NAME"
  echo -n "$PIT_TOKEN" | npx wrangler secret put GHL_V2_TOKEN --name "$STAGING_NAME"
  echo "  Staging secrets set."

  echo ""
  echo "Setting secrets on PRODUCTION..."
  echo -n "$PIT_TOKEN" | npx wrangler secret put GHL_API_KEY --name "$PROD_NAME"
  echo -n "$PIT_TOKEN" | npx wrangler secret put GHL_V2_TOKEN --name "$PROD_NAME"
  echo "  Production secrets set."

  echo ""
  echo "=== All secrets set! ==="

elif [ "$1" = "status" ]; then
  echo "=== Environment Status ==="
  echo ""
  echo "STAGING:"
  curl -s "https://$STAGING_NAME.lehr007.workers.dev/health" 2>/dev/null || echo "  (unreachable)"
  echo ""
  echo ""
  echo "PRODUCTION:"
  curl -s "https://thelistingteamproxy.reallistingteam.com/health" 2>/dev/null || echo "  (unreachable)"
  echo ""

elif [ "$1" = "rollback" ]; then
  echo "=== Rolling back to previous version ==="
  echo ""
  npx wrangler rollback --name "$PROD_NAME"

else
  echo "==============================================="
  echo "  The Listing Team Proxy - Deploy Script"
  echo "==============================================="
  echo ""
  echo "Usage:"
  echo "  ./deploy.sh staging     - Deploy worker.js to staging"
  echo "  ./deploy.sh production  - Deploy worker.js to production (with confirmation)"
  echo "  ./deploy.sh promote     - Promote staging to production (checks health first)"
  echo "  ./deploy.sh secrets     - Set PIT token on both environments"
  echo "  ./deploy.sh status      - Check health of staging + production"
  echo "  ./deploy.sh rollback    - Rollback production to previous version"
  echo ""
  echo "Workflow:"
  echo "  1. Make changes to worker.js"
  echo "  2. ./deploy.sh staging        (test your changes)"
  echo "  3. Verify at staging URL"
  echo "  4. ./deploy.sh promote        (push to production)"
  echo ""
  echo "URLs:"
  echo "  Staging:    https://$STAGING_NAME.lehr007.workers.dev"
  echo "  Production: https://thelistingteamproxy.reallistingteam.com"
fi
