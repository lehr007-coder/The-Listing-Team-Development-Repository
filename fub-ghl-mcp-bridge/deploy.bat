@echo off
REM FUB-GHL MCP Bridge - Automated Deployment Script for Windows

setlocal enabledelayedexpansion

echo ================================================
echo FUB-GHL MCP Bridge - Deployment Script
echo ================================================
echo.

REM Check if we're in the right directory
if not exist "package.json" (
    echo [ERROR] package.json not found
    echo Make sure you're in the fub-ghl-mcp-bridge directory:
    echo   cd The-Listing-Team-Development-Repository\fub-ghl-mcp-bridge
    pause
    exit /b 1
)

echo [OK] Found package.json - correct directory
echo.

REM Step 1: Install dependencies
echo [STEP 1] Installing dependencies...
call npm install
if errorlevel 1 (
    echo [ERROR] npm install failed
    pause
    exit /b 1
)
echo [OK] Dependencies installed
echo.

REM Step 2: Build TypeScript
echo [STEP 2] Building TypeScript...
call npm run build
if errorlevel 1 (
    echo [ERROR] npm run build failed
    pause
    exit /b 1
)
echo [OK] Build complete
echo.

REM Step 3: Install Wrangler globally
echo [STEP 3] Installing Wrangler CLI...
call npm install -g wrangler
if errorlevel 1 (
    echo [ERROR] npm install -g wrangler failed
    pause
    exit /b 1
)
echo [OK] Wrangler installed
echo.

REM Step 4: Check authentication
echo [STEP 4] Checking Cloudflare authentication...
call wrangler whoami >nul 2>&1
if errorlevel 1 (
    echo [INFO] Need to authenticate with Cloudflare...
    call wrangler login
) else (
    echo [OK] Already authenticated with Cloudflare
)
echo.

REM Step 5: Set secrets
echo [STEP 5] Setting environment secrets
echo You'll be prompted to paste each secret value.
echo.

set /p fub_api_key="Enter FUB_API_KEY: "
echo !fub_api_key! | wrangler secret put FUB_API_KEY
echo [OK] FUB_API_KEY set

set /p fub_x_system="Enter FUB_X_SYSTEM: "
echo !fub_x_system! | wrangler secret put FUB_X_SYSTEM
echo [OK] FUB_X_SYSTEM set

set /p fub_x_system_key="Enter FUB_X_SYSTEM_KEY: "
echo !fub_x_system_key! | wrangler secret put FUB_X_SYSTEM_KEY
echo [OK] FUB_X_SYSTEM_KEY set

set /p ghl_private_token="Enter GHL_PRIVATE_TOKEN: "
echo !ghl_private_token! | wrangler secret put GHL_PRIVATE_TOKEN
echo [OK] GHL_PRIVATE_TOKEN set

set /p ghl_location_id="Enter GHL_LOCATION_ID: "
echo !ghl_location_id! | wrangler secret put GHL_LOCATION_ID
echo [OK] GHL_LOCATION_ID set

echo.

REM Step 6: Deploy
echo [STEP 6] Deploying to Cloudflare Workers...
call npm run deploy
if errorlevel 1 (
    echo [ERROR] Deployment failed
    pause
    exit /b 1
)
echo [OK] Deployment complete!
echo.

REM Step 7: Test
echo [STEP 7] Testing deployment...
echo Your worker is now deployed!
echo.
echo To test your deployment, run:
echo   curl -X POST https://fub-ghl-mcp-bridge.example.workers.dev ^
echo     -H "Content-Type: application/json" ^
echo     -d "{\"jsonrpc\": \"2.0\", \"id\": 1, \"method\": \"health_check\", \"params\": {}}"
echo.

echo ================================================
echo [SUCCESS] Deployment successful!
echo ================================================
echo.
echo Next steps:
echo 1. Update your custom domain in wrangler.toml (optional)
echo 2. Test the health endpoint with the curl command above
echo 3. Integrate with Claude Code or GHL AI Agent Studio
echo.
echo Documentation:
echo   - README.md - Complete documentation
echo   - DEPLOYMENT.md - Integration guides
echo   - EXAMPLES.md - Code examples
echo.

pause
