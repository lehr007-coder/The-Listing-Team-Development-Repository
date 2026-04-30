#!/bin/bash

# Integration testing script
# Tests both Claude Code and GHL integrations

set -e

WORKER_URL="https://fub-ghl-mcp-bridge.lehr007.workers.dev"

echo "================================================"
echo "Integration Testing Suite"
echo "================================================"
echo ""
echo "Worker URL: $WORKER_URL"
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Function to test an MCP tool
test_mcp_tool() {
    local tool_name=$1
    local payload=$2
    local description=$3

    echo "Testing: $description"

    response=$(curl -s -X POST "$WORKER_URL" \
        -H "Content-Type: application/json" \
        -d "$payload" 2>/dev/null || echo '{"error":{"message":"Connection failed"}}')

    if echo "$response" | grep -q '"status":"ok"\|"contactId"\|"persons"'; then
        echo -e "${GREEN}✓ PASS${NC}: $tool_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}✗ FAIL${NC}: $tool_name"
        echo "  Response: $response"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
    echo ""
}

# Test 1: Health Check
echo "=== TEST 1: Health Check ==="
test_mcp_tool "health_check" \
    '{"jsonrpc":"2.0","id":1,"method":"health_check","params":{}}' \
    "Service is running"

# Test 2: Search FUB Person (will return empty but should respond)
echo "=== TEST 2: Search FUB Person ==="
test_mcp_tool "search_fub_person" \
    '{"jsonrpc":"2.0","id":2,"method":"search_fub_person","params":{"email":"test@example.com"}}' \
    "Can search FUB people"

# Test 3: Create/Update GHL Contact
echo "=== TEST 3: Create/Update GHL Contact ==="
test_mcp_tool "create_or_update_ghl_contact" \
    '{"jsonrpc":"2.0","id":3,"method":"create_or_update_ghl_contact","params":{"firstName":"Test","lastName":"User","email":"test-'$(date +%s)'@example.com"}}' \
    "Can create GHL contacts"

# Test 4: Invalid Request (should fail gracefully)
echo "=== TEST 4: Error Handling ==="
response=$(curl -s -X POST "$WORKER_URL" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":4,"method":"invalid_method","params":{}}' 2>/dev/null || echo '{}')

if echo "$response" | grep -q '"error"'; then
    echo -e "${GREEN}✓ PASS${NC}: Error handling works"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}✗ FAIL${NC}: Error handling"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi
echo ""

# Summary
echo "================================================"
echo "TEST SUMMARY"
echo "================================================"
echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ ALL TESTS PASSED!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Run: ./setup-claude-code.sh"
    echo "  2. Run: ./setup-ghl.sh"
    echo "  3. Configure both integrations"
    echo ""
    exit 0
else
    echo -e "${RED}❌ SOME TESTS FAILED${NC}"
    echo ""
    echo "Troubleshooting:"
    echo "  • Check worker is deployed: $WORKER_URL"
    echo "  • Verify secrets are set: wrangler secret list"
    echo "  • Check logs: wrangler tail"
    echo ""
    exit 1
fi
