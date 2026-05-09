#!/usr/bin/env bash
# setup-ghl-fields.sh — Create the 22 sidecar-owned custom fields in GHL,
# but ONLY ones that don't already exist. Idempotent. Safe to re-run.
#
# Usage:
#   GHL_V2_TOKEN='eyJ...' bash scripts/setup-ghl-fields.sh
#
# Optional:
#   GHL_LOCATION_ID='SeZr4YCwEZ50IcWqylkQ'   (auto-decoded from JWT if unset)
#   DRY_RUN=1                                (list only, don't create)
#
# Relies on the GHL v2 customFields API:
#   GET    /locations/<loc>/customFields              → list existing
#   POST   /locations/<loc>/customFields              → create one

set -euo pipefail

if [ -z "${GHL_V2_TOKEN:-}" ]; then
  echo "ERROR: set GHL_V2_TOKEN env var (paste your private integration token)"
  echo "  Example: GHL_V2_TOKEN='eyJ...' bash scripts/setup-ghl-fields.sh"
  exit 1
fi

LOC="${GHL_LOCATION_ID:-}"
if [ -z "$LOC" ]; then
  # Decode location_id from JWT payload
  LOC=$(echo "$GHL_V2_TOKEN" | cut -d'.' -f2 | python3 -c '
import sys, base64, json
raw = sys.stdin.read().strip()
raw += "=" * (-len(raw) % 4)
data = json.loads(base64.urlsafe_b64decode(raw))
print(data.get("location_id", ""))
')
  if [ -z "$LOC" ]; then
    echo "ERROR: could not extract location_id from token; set GHL_LOCATION_ID manually"
    exit 1
  fi
fi

echo "Location: $LOC"
echo "Dry run:  ${DRY_RUN:-0}"
echo

# JWT payload version=1 → use v1 endpoint (rest.gohighlevel.com).
# JWT payload version=2 (or token starts with sb_/pit_) → use v2 (services.leadconnectorhq.com).
JWT_VERSION=$(echo "$GHL_V2_TOKEN" | cut -d'.' -f2 | python3 -c '
import sys, base64, json
raw = sys.stdin.read().strip()
raw += "=" * (-len(raw) % 4)
try:
    data = json.loads(base64.urlsafe_b64decode(raw))
    print(data.get("version", 2))
except Exception:
    print(2)
' 2>/dev/null || echo "2")

if [ "$JWT_VERSION" = "1" ]; then
  API_BASE="https://rest.gohighlevel.com/v1"
  LIST_PATH="/custom-fields/"
  CREATE_PATH="/custom-fields/"
  AUTH_HEADER="Authorization: Bearer $GHL_V2_TOKEN"
  VERSION_HEADER=""
  echo "API: v1 (rest.gohighlevel.com) — token version=$JWT_VERSION"
else
  API_BASE="https://services.leadconnectorhq.com"
  LIST_PATH="/locations/$LOC/customFields"
  CREATE_PATH="/locations/$LOC/customFields"
  AUTH_HEADER="Authorization: Bearer $GHL_V2_TOKEN"
  VERSION_HEADER="Version: 2021-07-28"
  echo "API: v2 (services.leadconnectorhq.com)"
fi
echo

# ── 22 fields the sidecar owns ──
# Format: fieldKey|displayName|dataType
# dataType per GHL v2 docs: TEXT | LARGE_TEXT | NUMERICAL | DATE | CHECKBOX | …
FIELDS=$(cat <<'EOF'
ai_video_type|AI Video Type|TEXT
ai_video_script|AI Video Script|LARGE_TEXT
ai_video_scene_plan|AI Video Scene Plan|LARGE_TEXT
video_render_engine|Video Render Engine|TEXT
video_priority_score|Video Priority Score|NUMERICAL
video_trigger_reason|Video Trigger Reason|TEXT
video_status|Video Status|TEXT
video_render_job_id|Video Render Job Id|TEXT
video_url|Video Url|TEXT
video_gif_url|Video Gif Url|TEXT
video_thumbnail_url|Video Thumbnail Url|TEXT
video_last_rendered|Video Last Rendered|DATE
video_last_sent|Video Last Sent|DATE
video_delivery_method|Video Delivery Method|TEXT
video_opened|Video Opened|TEXT
video_clicked|Video Clicked|TEXT
video_watch_percent|Video Watch Percent|NUMERICAL
video_engagement_score|Video Engagement Score|NUMERICAL
social_content_type|Social Content Type|TEXT
worthy_of_social|Worthy Of Social|TEXT
last_video_type|Last Video Type|TEXT
last_video_cta|Last Video Cta|TEXT
EOF
)

# ── 1. List existing fieldKeys ──
echo "Fetching existing custom fields..."
if [ -n "$VERSION_HEADER" ]; then
  LIST_RESP=$(curl -s -w "\n__HTTP__%{http_code}" \
    -H "$AUTH_HEADER" -H "$VERSION_HEADER" \
    "$API_BASE$LIST_PATH")
else
  LIST_RESP=$(curl -s -w "\n__HTTP__%{http_code}" \
    -H "$AUTH_HEADER" \
    "$API_BASE$LIST_PATH")
fi
LIST_CODE=$(echo "$LIST_RESP" | grep -o "__HTTP__[0-9]*" | sed 's/__HTTP__//')
LIST_BODY=$(echo "$LIST_RESP" | sed 's/__HTTP__[0-9]*$//')

if [ "$LIST_CODE" != "200" ]; then
  echo "ERROR: GHL list returned HTTP $LIST_CODE"
  echo "Response body:"
  echo "$LIST_BODY"
  echo
  echo "Common causes:"
  echo "  * Token lacks 'View custom fields' scope — re-mint with that scope at"
  echo "    GHL → Settings → Private Integrations"
  echo "  * Wrong location_id (decoded: $LOC). Override with GHL_LOCATION_ID=..."
  echo "  * Token expired or invalid"
  exit 1
fi

EXISTING=$(echo "$LIST_BODY" | python3 -c '
import sys, json
try:
    d = json.loads(sys.stdin.read())
except Exception as e:
    sys.stderr.write(f"JSON parse failed: {e}\n")
    sys.exit(1)
# v1 uses "customFields", v2 uses "customFields" too. Both have "fieldKey".
fields = d.get("customFields") or d.get("custom_fields") or d.get("fields") or []
for f in fields:
    key = (f.get("fieldKey") or f.get("key") or f.get("name") or "").strip()
    if key.startswith("contact."):
        key = key[len("contact."):]
    if key:
        print(key)
')

EXISTING_COUNT=$(echo "$EXISTING" | grep -c . || true)
echo "Found $EXISTING_COUNT existing custom fields on this location."
echo

# ── 2. Determine which of our 22 need creating ──
TO_CREATE=""
echo "Collision check:"
while IFS='|' read -r KEY NAME TYPE; do
  [ -z "$KEY" ] && continue
  if echo "$EXISTING" | grep -qx "$KEY"; then
    echo "  [SKIP] $KEY (already exists)"
  else
    echo "  [CREATE] $KEY ($TYPE)"
    TO_CREATE+="$KEY|$NAME|$TYPE"$'\n'
  fi
done <<< "$FIELDS"
echo

CREATE_COUNT=$(echo -n "$TO_CREATE" | grep -c . || true)
if [ "$CREATE_COUNT" = "0" ]; then
  echo "All 22 sidecar fields already exist. Nothing to do."
  exit 0
fi

echo "$CREATE_COUNT fields will be created."
if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "DRY_RUN=1 set — exiting without creating."
  exit 0
fi

# ── 3. Create the missing fields ──
echo
echo "Creating missing fields..."
SUCCESS=0
FAIL=0
while IFS='|' read -r KEY NAME TYPE; do
  [ -z "$KEY" ] && continue
  if [ "$JWT_VERSION" = "1" ]; then
    # v1 body
    PAYLOAD=$(python3 -c "
import json
print(json.dumps({
    'name': '$NAME',
    'dataType': '$TYPE',
}))
")
  else
    # v2 body
    PAYLOAD=$(python3 -c "
import json
print(json.dumps({
    'name': '$NAME',
    'dataType': '$TYPE',
    'model': 'contact',
    'showInForms': False,
}))
")
  fi
  if [ -n "$VERSION_HEADER" ]; then
    RESP=$(curl -s -w "\n%{http_code}" -X POST \
      -H "$AUTH_HEADER" -H "$VERSION_HEADER" -H "Content-Type: application/json" \
      -d "$PAYLOAD" \
      "$API_BASE$CREATE_PATH")
  else
    RESP=$(curl -s -w "\n%{http_code}" -X POST \
      -H "$AUTH_HEADER" -H "Content-Type: application/json" \
      -d "$PAYLOAD" \
      "$API_BASE$CREATE_PATH")
  fi
  CODE=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | sed '$d')
  if [ "$CODE" = "200" ] || [ "$CODE" = "201" ]; then
    NEW_ID=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); f=d.get('customField') or d; print(f.get('id','?'))" 2>/dev/null || echo "?")
    echo "  [OK]   $KEY → id=$NEW_ID"
    SUCCESS=$((SUCCESS+1))
  else
    echo "  [FAIL] $KEY → HTTP $CODE"
    echo "         $BODY"
    FAIL=$((FAIL+1))
  fi
done <<< "$TO_CREATE"

echo
echo "─────────────────────────────"
echo "  $SUCCESS created · $FAIL failed"
if [ $FAIL -eq 0 ]; then
  echo "  All sidecar custom fields are in place."
  exit 0
else
  exit 1
fi
