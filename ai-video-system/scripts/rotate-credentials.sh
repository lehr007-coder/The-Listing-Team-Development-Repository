#!/usr/bin/env bash
# rotate-credentials.sh — guided rotation of every secret used by the
# ai-video-system worker (both staging and production).
#
# What this script does:
#   1. Generates a fresh PROXY_API_KEY (random) and pushes to both envs
#   2. For each external secret (PIT, HeyGen, Anthropic, CF Stream,
#      Supabase service-role): prompts you to mint a new value at the
#      provider, paste it, and pushes to both envs
#   3. Prints a summary with the new PROXY_API_KEY (only secret you
#      need to capture; everything else is provider-rotated)
#
# What this script does NOT do:
#   • Mint values at external providers — you do that in their UI.
#     The script tells you exactly which URL to open for each.
#   • Update GHL workflow webhook headers — the new PROXY_API_KEY
#     value will need to be updated in the two GHL workflow webhooks
#     (paste the new key into the X-API-Key header field).
#
# Usage:
#   cd ai-video-system
#   bash scripts/rotate-credentials.sh

set -euo pipefail

cd "$(dirname "$0")/.."

cat <<'EOF'
═══════════════════════════════════════════════════════════════════════
  AI Video System — Credential Rotation
═══════════════════════════════════════════════════════════════════════

This will rotate every secret on both staging and production workers.
You'll need 5–10 minutes and access to the following provider dashboards:

  • GHL Settings → Private Integrations          (mint new PIT)
  • https://console.anthropic.com/settings/keys  (mint new key)
  • HeyGen Space Settings → API                  (mint new key)
  • Cloudflare My Profile → API Tokens           (Stream:Edit token)
  • Supabase ylopo-intelligence → Settings → API (service_role key)

After this completes, you must also update:

  • GHL workflow "AI VIDEO — HEYGEN" → Webhook → X-API-Key header
  • GHL workflow "AI VIDEO — FCPXML" → Webhook → X-API-Key header
    (paste the NEW PROXY_API_KEY printed at the end of this script)

Press Ctrl-C now to abort. Otherwise, hit Enter to continue.
EOF
read -r

# ── Helper ────────────────────────────────────────────────────────────
apply_to_both() {
  local NAME="$1" VALUE="$2"
  echo
  echo "→ Setting $NAME on STAGING..."
  echo "$VALUE" | npx wrangler@latest secret put "$NAME" --config wrangler.staging.toml
  echo "→ Setting $NAME on PRODUCTION..."
  echo "$VALUE" | npx wrangler@latest secret put "$NAME" --config wrangler.toml
}

prompt_for_secret() {
  local NAME="$1" PROVIDER_URL="$2" INSTR="$3"
  echo
  echo "═══ $NAME ═══"
  echo "  Open: $PROVIDER_URL"
  echo "  $INSTR"
  echo "  Paste the new value below (input is hidden):"
  read -rs VALUE
  echo
  if [ -z "$VALUE" ]; then
    echo "(empty — skipping $NAME)"
    return
  fi
  apply_to_both "$NAME" "$VALUE"
}

# ── 1. Auto-generate PROXY_API_KEY ────────────────────────────────────
NEW_PROXY_API_KEY=$(openssl rand -base64 48 | tr -d '=+/' | cut -c1-48)
apply_to_both "PROXY_API_KEY" "$NEW_PROXY_API_KEY"

# ── 2. External secrets — user mints, pastes ──────────────────────────
prompt_for_secret "GHL_V2_TOKEN" \
  "GHL → Settings → Private Integrations → Create New Integration" \
  "Scopes: contacts.readonly, contacts.write, conversations/message.write, locations/customFields.readonly. Token starts with 'pit-'."

prompt_for_secret "ANTHROPIC_API_KEY" \
  "https://console.anthropic.com/settings/keys" \
  "Click Create Key. Token starts with 'sk-ant-api03-'."

prompt_for_secret "HEYGEN_API_KEY" \
  "HeyGen → Space Settings → API" \
  "Generate new API key. Token starts with 'sk_V2_'."

prompt_for_secret "CF_STREAM_API_TOKEN" \
  "https://dash.cloudflare.com/profile/api-tokens" \
  "Create Custom Token with Account → Stream → Edit permission. Account Resources: Lehr007@gmail.com's Account."

prompt_for_secret "SUPABASE_KEY" \
  "https://supabase.com/dashboard/project/tglbjiehyfyrefxwgmzz/settings/api-keys" \
  "service_role key (NOT publishable). Long string starting with 'sb_secret_' or a JWT 'eyJ...'."

# ── 3. Optional: HEYGEN avatar/voice IDs ──────────────────────────────
echo
echo "═══ Skip-or-rotate: HEYGEN_DEFAULT_AVATAR_ID ═══"
echo "  Press Enter to keep current value, OR paste a new HeyGen avatar_id:"
read -r AVATAR
if [ -n "$AVATAR" ]; then apply_to_both "HEYGEN_DEFAULT_AVATAR_ID" "$AVATAR"; fi

echo
echo "═══ Skip-or-rotate: HEYGEN_DEFAULT_VOICE_ID ═══"
echo "  Press Enter to keep current value, OR paste a new HeyGen voice_id:"
read -r VOICE
if [ -n "$VOICE" ]; then apply_to_both "HEYGEN_DEFAULT_VOICE_ID" "$VOICE"; fi

# ── 4. Summary ────────────────────────────────────────────────────────
cat <<EOF

═══════════════════════════════════════════════════════════════════════
  Rotation complete
═══════════════════════════════════════════════════════════════════════

NEW PROXY_API_KEY (save this somewhere safe):

  $NEW_PROXY_API_KEY

NEXT STEPS:

  1. Update the X-API-Key header in BOTH GHL workflows:
     • AI VIDEO — HEYGEN  → Webhook → X-API-Key
     • AI VIDEO — FCPXML  → Webhook → X-API-Key
     Paste the new PROXY_API_KEY value above.

  2. Verify against production:
     PROXY_API_KEY='$NEW_PROXY_API_KEY' \\
       BASE_URL='https://videos.reallistingteam.com' \\
       ./scripts/verify.sh

  3. Watch the next live tag-trigger to confirm it works end-to-end.

Old credentials are now invalid. Disable / revoke them at the providers
above when convenient.
EOF
