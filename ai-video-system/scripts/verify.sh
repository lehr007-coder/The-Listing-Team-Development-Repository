#!/usr/bin/env bash
# verify.sh — one-shot health check for ai-video-system staging or prod.
#
# Usage:
#   PROXY_API_KEY=xxx ./scripts/verify.sh                       (staging default)
#   PROXY_API_KEY=xxx BASE_URL=https://videos.reallistingteam.com ./scripts/verify.sh
#
# Exits 0 if everything green, 1 otherwise. Does NOT trigger renders (no cost).

set -euo pipefail

BASE_URL="${BASE_URL:-https://ai-video-system-staging.lehr007.workers.dev}"
KEY="${PROXY_API_KEY:-${AI_VIDEO_API_KEY:-}}"

red()   { printf "\033[31m%s\033[0m" "$1"; }
green() { printf "\033[32m%s\033[0m" "$1"; }
yellow(){ printf "\033[33m%s\033[0m" "$1"; }

ok=0; fail=0; warn=0

check() {
  local name="$1" cmd="$2" expect="$3"
  local out
  if out=$(eval "$cmd" 2>&1); then
    if echo "$out" | grep -qE "$expect"; then
      printf "  %s  %s\n" "$(green "[OK]")" "$name"
      ok=$((ok+1))
    else
      printf "  %s  %s\n      got: %s\n" "$(red "[FAIL]")" "$name" "$out"
      fail=$((fail+1))
    fi
  else
    printf "  %s  %s\n      err: %s\n" "$(red "[FAIL]")" "$name" "$out"
    fail=$((fail+1))
  fi
}

note() { printf "  %s  %s\n" "$(yellow "[NOTE]")" "$1"; warn=$((warn+1)); }

echo
echo "=== ai-video-system verify"
echo "BASE_URL=$BASE_URL"
echo

# 1. Public health
echo "1. Public health endpoint"
check "/v1/health responds 200" \
      "curl -sf '$BASE_URL/v1/health'" \
      '"ok":\s*true'
check "VIDEO_BUCKET binding present" \
      "curl -sf '$BASE_URL/v1/health'" \
      '"VIDEO_BUCKET":\s*true'
check "PREVIEW_BUCKET binding present" \
      "curl -sf '$BASE_URL/v1/health'" \
      '"PREVIEW_BUCKET":\s*true'
check "VIDEO_KV binding present" \
      "curl -sf '$BASE_URL/v1/health'" \
      '"VIDEO_KV":\s*true'

# Inspect upstreams (warnings, not failures — until secrets are set)
upstream_json=$(curl -sf "$BASE_URL/v1/health" || echo '{}')
for u in heygen fcpxml cf_stream ghl supabase; do
  if echo "$upstream_json" | grep -q "\"$u\":\s*true"; then
    printf "  %s  upstream:%s\n" "$(green "[OK]")" "$u"
    ok=$((ok+1))
  else
    note "upstream:$u not configured (set secret)"
  fi
done
echo

# 2. Auth
echo "2. Authenticated endpoints"
if [ -z "${KEY:-}" ]; then
  note "PROXY_API_KEY not set in env — skipping auth checks"
else
  check "/v1/admin/jobs requires API key" \
        "curl -s -o /dev/null -w '%{http_code}' '$BASE_URL/v1/admin/jobs'" \
        '^401$'
  check "/v1/admin/jobs accepts X-API-Key" \
        "curl -sf -H 'X-API-Key: $KEY' '$BASE_URL/v1/admin/jobs?limit=1'" \
        '"jobs":\s*\['
  check "/v1/admin/health-deep returns counters" \
        "curl -sf -H 'X-API-Key: $KEY' '$BASE_URL/v1/admin/health-deep'" \
        '"counters":'
fi
echo

# 3. Hosted page renders the unknown-job HTML for a fake id
echo "3. Hosted player page"
check "/v/<bogus> returns HTML" \
      "curl -s '$BASE_URL/v/vj_does_not_exist'" \
      '<!doctype html>'
echo

# 4. Open pixel returns a GIF (use full GET; HEAD isn't routed)
echo "4. Tracking pixel"
check "/v1/analytics/open returns image/gif" \
      "curl -s -D- -o /dev/null '$BASE_URL/v1/analytics/open?job=vj_does_not_exist' | tr -d '\r' | grep -i '^content-type'" \
      'image/gif'
echo

# 5. Click redirect
echo "5. Click redirect"
check "/v1/analytics/click redirects 302" \
      "curl -s -o /dev/null -w '%{http_code}' '$BASE_URL/v1/analytics/click?job=vj_x&to=https%3A%2F%2Fexample.com'" \
      '^302$'
echo

# 6. Cost guardrails (KV-backed; cheap)
echo "6. Cost guardrails"
if [ -z "${KEY:-}" ]; then
  note "PROXY_API_KEY not set — skipping rate-limits / kill-switch checks"
else
  check "/v1/admin/rate-limits returns daily counters" \
        "curl -sf -H 'X-API-Key: $KEY' '$BASE_URL/v1/admin/rate-limits'" \
        '"global":'
  check "/v1/admin/kill returns kill-switch state" \
        "curl -sf -H 'X-API-Key: $KEY' '$BASE_URL/v1/admin/kill'" \
        '"killed":\s*(true|false)'
fi
echo

# 7. Reporting endpoints (Supabase-backed; should return shape even if empty)
echo "7. Reporting endpoints"
if [ -z "${KEY:-}" ]; then
  note "PROXY_API_KEY not set — skipping daily-summary / contacts/top checks"
else
  check "/v1/admin/daily-summary returns window + jobs" \
        "curl -sf -H 'X-API-Key: $KEY' '$BASE_URL/v1/admin/daily-summary?days=7'" \
        '"window":'
  check "/v1/admin/contacts/top returns leaderboard shape" \
        "curl -sf -H 'X-API-Key: $KEY' '$BASE_URL/v1/admin/contacts/top?limit=5'" \
        '"contacts":\s*\['
fi
echo

# 8. Dashboard HTML (unauthenticated; calls to /v1/admin/* require key from page)
echo "8. Admin dashboard"
check "/admin returns HTML page" \
      "curl -sf '$BASE_URL/admin'" \
      '<!doctype html>'
echo

# 9. Agent-test endpoint (zero render cost — just LLM call)
echo "9. Agent-test endpoint"
if [ -z "${KEY:-}" ]; then
  note "PROXY_API_KEY not set — skipping agent-test discovery"
else
  check "GET /v1/admin/agents/test lists samples" \
        "curl -sf -H 'X-API-Key: $KEY' '$BASE_URL/v1/admin/agents/test'" \
        '"available_agents":'
fi
echo

# Summary
echo "─────────────────────────────"
printf "  %s ok   %s warn   %s fail\n" \
       "$(green "$ok")" "$(yellow "$warn")" "$(red "$fail")"

if [ $fail -eq 0 ]; then
  echo "  $(green "ALL GREEN") — sidecar is reachable and bindings are wired."
  if [ $warn -gt 0 ]; then
    echo "  Set the upstream secrets per docs/DEPLOYMENT.md to flip the [NOTE]s green."
  fi
  exit 0
else
  echo "  $(red "VERIFY FAILED") — see [FAIL] lines above."
  exit 1
fi
