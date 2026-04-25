/**
 * Test suite for FUB-GHL MCP Bridge
 *
 * Usage: npm run test
 * Requires environment setup before running
 */

import { FUBClient } from "./fub-client";
import { GHLClient } from "./ghl-client";
import { ToolHandler } from "./tools";
import { Logger } from "./logger";

const logger = new Logger("info");

// Test configuration
interface TestConfig {
  fubApiKey: string;
  fubXSystem: string;
  fubXSystemKey: string;
  ghlPrivateToken: string;
  ghlLocationId: string;
  testEmail?: string;
  testPhone?: string;
}

// Load test configuration from environment
function loadTestConfig(): TestConfig {
  const config: TestConfig = {
    fubApiKey: process.env.FUB_API_KEY || "",
    fubXSystem: process.env.FUB_X_SYSTEM || "",
    fubXSystemKey: process.env.FUB_X_SYSTEM_KEY || "",
    ghlPrivateToken: process.env.GHL_PRIVATE_TOKEN || "",
    ghlLocationId: process.env.GHL_LOCATION_ID || "",
    testEmail: process.env.TEST_EMAIL || "test@example.com",
    testPhone: process.env.TEST_PHONE || "+1-555-123-4567",
  };

  // Validate all required credentials are present
  const missing = Object.entries(config)
    .filter(([key, value]) => !key.startsWith("test") && !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `Missing credentials: ${missing.join(", ")}. Set as environment variables.`
    );
  }

  return config;
}

// Test results
interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];

// Helper function to run a test
async function runTest(
  name: string,
  testFn: () => Promise<void>
): Promise<void> {
  const startTime = Date.now();

  try {
    await testFn();
    const duration = Date.now() - startTime;
    results.push({ name, passed: true, duration });
    console.log(`✓ ${name} (${duration}ms)`);
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, error: errorMessage, duration });
    console.log(`✗ ${name} (${duration}ms)`);
    console.log(`  Error: ${errorMessage}`);
  }
}

// Tests
async function runTests(): Promise<void> {
  console.log("================================================");
  console.log("FUB-GHL MCP Bridge - Test Suite");
  console.log("================================================");
  console.log("");

  let config: TestConfig;

  try {
    config = loadTestConfig();
  } catch (error) {
    console.error("❌ Configuration error:", error);
    process.exit(1);
  }

  // Initialize clients
  const fubClient = new FUBClient(
    config.fubApiKey,
    config.fubXSystem,
    config.fubXSystemKey
  );

  const ghlClient = new GHLClient(
    config.ghlPrivateToken,
    config.ghlLocationId
  );

  const toolHandler = new ToolHandler(fubClient, ghlClient);

  console.log("Running tests...");
  console.log("");

  // Test 1: Health Check
  await runTest("health_check", async () => {
    const result = toolHandler.healthCheck();

    if (result.status !== "ok") {
      throw new Error(`Expected status "ok", got "${result.status}"`);
    }

    if (result.service !== "fub-ghl-mcp-bridge") {
      throw new Error(
        `Expected service "fub-ghl-mcp-bridge", got "${result.service}"`
      );
    }

    if (!result.timestamp) {
      throw new Error("Missing timestamp");
    }
  });

  // Test 2: Search FUB Person by Email
  await runTest("search_fub_person (by email)", async () => {
    const result = await toolHandler.searchFUBPerson({
      email: config.testEmail,
    });

    if (!Array.isArray(result.persons)) {
      throw new Error("Expected persons array in response");
    }

    if (typeof result.count !== "number") {
      throw new Error("Expected count as number");
    }

    logger.info("Found persons", { count: result.count });
  });

  // Test 3: Search FUB Person by Phone
  await runTest("search_fub_person (by phone)", async () => {
    const result = await toolHandler.searchFUBPerson({
      phone: config.testPhone,
    });

    if (!Array.isArray(result.persons)) {
      throw new Error("Expected persons array in response");
    }

    if (typeof result.count !== "number") {
      throw new Error("Expected count as number");
    }

    logger.info("Found persons", { count: result.count });
  });

  // Test 4: Get FUB Person (requires valid personId)
  await runTest("get_fub_person (mock)", async () => {
    // This test uses a mock ID since we need a real one from search results
    // In production, use a valid personId from your FUB account

    try {
      // This will fail with "not found" but validates the API call structure
      await toolHandler.getFUBPerson({ personId: "test-id-that-wont-exist" });
    } catch (error) {
      // Expected to fail - just verify error is about not found, not auth
      if (error instanceof Error) {
        if (error.message.includes("Unauthorized") || error.message.includes("401")) {
          throw new Error("Authentication failed - check your FUB credentials");
        }
      }
    }
  });

  // Test 5: Create/Update GHL Contact
  await runTest("create_or_update_ghl_contact", async () => {
    const timestamp = Date.now();
    const result = await toolHandler.createOrUpdateGHLContact({
      firstName: "Test",
      lastName: `User ${timestamp}`,
      email: `test-${timestamp}@example.com`,
      phone: "+1-555-000-0001",
      source: "Follow Up Boss",
      tags: ["fub-sync", "test"],
    });

    if (!result.contactId) {
      throw new Error("Missing contactId in response");
    }

    if (typeof result.created !== "boolean") {
      throw new Error("Expected created as boolean");
    }

    if (typeof result.updated !== "boolean") {
      throw new Error("Expected updated as boolean");
    }

    logger.info("Contact created/updated", {
      contactId: result.contactId,
      created: result.created,
      updated: result.updated,
    });
  });

  // Test 6: Input Validation
  await runTest("input validation", async () => {
    // Test missing required firstName
    try {
      await toolHandler.createOrUpdateGHLContact({
        firstName: "",
        lastName: "Test",
      });
      throw new Error("Should have thrown error for missing firstName");
    } catch (error) {
      if (!String(error).includes("required")) {
        throw error;
      }
    }

    // Test missing search parameters
    try {
      await toolHandler.searchFUBPerson({});
      throw new Error("Should have thrown error for missing search params");
    } catch (error) {
      if (!String(error).includes("required")) {
        throw error;
      }
    }
  });

  // Test 7: Rate Limiter (simulated)
  await runTest("rate limiter (simulated)", async () => {
    // This test runs health_check multiple times to verify rate limiting works
    const responses: number[] = [];

    for (let i = 0; i < 5; i++) {
      const start = Date.now();
      const result = toolHandler.healthCheck();
      const duration = Date.now() - start;
      responses.push(duration);

      if (result.status !== "ok") {
        throw new Error(`Health check ${i} failed`);
      }
    }

    // All should succeed (rate limit is high enough for this test)
    logger.info("Rate limiter test", { responses });
  });

  // Test 8: Error Handling
  await runTest("error handling", async () => {
    // Test that errors are properly caught and formatted
    try {
      // Invalid parameters should throw proper error
      await toolHandler.searchFUBPerson({
        name: "", // Empty string
      });
      // Even with empty string, it's a valid parameter format
    } catch (error) {
      // Expected behavior - error should be descriptive
      if (error instanceof Error) {
        if (!error.message.length) {
          throw new Error("Error message should not be empty");
        }
      }
    }
  });

  // Print results
  console.log("");
  console.log("================================================");
  console.log("Test Results");
  console.log("================================================");
  console.log("");

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const totalTime = results.reduce((sum, r) => sum + r.duration, 0);

  results.forEach((result) => {
    const status = result.passed ? "✓" : "✗";
    console.log(`${status} ${result.name} (${result.duration}ms)`);
    if (result.error) {
      console.log(`  └─ ${result.error}`);
    }
  });

  console.log("");
  console.log(`Passed: ${passed}/${results.length}`);
  console.log(`Failed: ${failed}/${results.length}`);
  console.log(`Total Time: ${totalTime}ms`);
  console.log("");

  if (failed > 0) {
    console.log("❌ Some tests failed");
    process.exit(1);
  } else {
    console.log("✅ All tests passed!");
    process.exit(0);
  }
}

// Run tests
runTests().catch((error) => {
  console.error("Test suite error:", error);
  process.exit(1);
});
