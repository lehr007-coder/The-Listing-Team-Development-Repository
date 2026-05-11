#!/usr/bin/env bash
# Guided setup for the four GHL Marketplace secrets the new OAuth + SSO
# routes need. Run from the repo root:
#
#   ./thelistingteamproxy/scripts/setup-marketplace-secrets.sh staging
#   ./thelistingteamproxy/scripts/setup-marketplace-secrets.sh production
#
# You'll be prompted for each value once and it gets pushed to the
# appropriate worker via `wrangler secret put`. Values are NEVER stored
# locally — they go straight to Cloudflare.

set -euo pipefail

env_target="${1:-}"
case "$env_target" in
  staging)
    config="wrangler.staging.toml"
    worker="thelistingteamproxy-staging"
    default_redirect="https://thelistingteamproxy-staging.lehr007.workers.dev/api/auth/ghl-oauth/callback"
    ;;
  production)
    config="wrangler.toml"
    worker="thelistingteamproxy"
    default_redirect="https://thelistingteamproxy.reallistingteam.com/api/auth/ghl-oauth/callback"
    ;;
  *)
    echo "Usage: $0 <staging|production>"
    exit 1
    ;;
esac

cd "$(dirname "$0")/.."  # cd into thelistingteamproxy/

echo
echo "Setting GHL Marketplace secrets on $worker (config: $config)."
echo "You'll be prompted for each value. Get them from:"
echo "  https://marketplace.gohighlevel.com/  -> your app  -> Authentication tab"
echo

prompt_and_set () {
  local secret_name="$1"
  local hint="$2"
  local default_value="${3:-}"
  echo
  echo "----- $secret_name -----"
  echo "$hint"
  if [ -n "$default_value" ]; then
    echo "Press Enter to accept default: $default_value"
  fi
  read -r -p "Value: " val
  if [ -z "$val" ] && [ -n "$default_value" ]; then
    val="$default_value"
  fi
  if [ -z "$val" ]; then
    echo "Skipped (empty)."
    return
  fi
  printf '%s' "$val" | npx wrangler@latest secret put "$secret_name" --config "$config"
}

prompt_and_set GHL_OAUTH_CLIENT_ID \
  "GHL Marketplace -> your app -> Authentication -> Client ID"

prompt_and_set GHL_OAUTH_CLIENT_SECRET \
  "GHL Marketplace -> your app -> Authentication -> Client Secret"

prompt_and_set GHL_OAUTH_REDIRECT_URI \
  "Must match the Redirect URI configured on the Marketplace app." \
  "$default_redirect"

prompt_and_set GHL_SSO_KEY \
  "GHL Marketplace -> your app -> SSO -> Shared Secret (used to decrypt the iframe postMessage token)"

echo
echo "Done. Verify with:"
echo "  npx wrangler@latest secret list --config $config"
echo
echo "Next steps:"
echo "  1. Confirm the worker is reachable (workers.dev or custom domain returns non-403)."
echo "  2. Update GHL Marketplace app URLs to point at $worker hostname:"
echo "     Install URL:    https://<host>/api/auth/ghl-oauth/install"
echo "     Redirect URL:   $default_redirect"
echo "     Custom menu:    https://<host>/ghl-sso"
echo "  3. Uninstall + reinstall the app in your test sub-account."
echo "  4. Click the Dashboard menu link in GHL -> should auto-login to /dashboard."
