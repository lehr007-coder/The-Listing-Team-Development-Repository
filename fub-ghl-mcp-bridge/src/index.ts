import { FUBClient } from "./fub-client";
import { GHLClient } from "./ghl-client";
import { ToolHandler } from "./tools";
import { RateLimiter } from "./rate-limiter";
import { Logger, generateRequestId } from "./logger";
import {
  MCPRequest,
  MCPResponse,
  SearchFUBPersonInput,
  GetFUBPersonInput,
  CreateOrUpdateGHLContactInput,
  SyncFUBPersonToGHLInput,
  CreateGHLOpportunityFromFUBDealInput,
} from "./types";

interface CloudflareEnv {
  FUB_API_KEY: string;
  FUB_X_SYSTEM: string;
  FUB_X_SYSTEM_KEY: string;
  GHL_PRIVATE_TOKEN: string;
  GHL_LOCATION_ID: string;
  RATE_LIMIT_REQUESTS?: string;
  RATE_LIMIT_WINDOW?: string;
  REQUEST_TIMEOUT?: string;
  LOG_LEVEL?: string;
}

let rateLimiter: RateLimiter;
let toolHandler: ToolHandler;
let logger: Logger;

function initializeClients(env: CloudflareEnv): void {
  if (toolHandler) return;

  const requestTimeout = parseInt(env.REQUEST_TIMEOUT || "15000", 10);
  const logLevel = env.LOG_LEVEL || "info";
  const maxRequests = parseInt(env.RATE_LIMIT_REQUESTS || "100", 10);
  const windowMs = parseInt(env.RATE_LIMIT_WINDOW || "60", 10) * 1000;

  logger = new Logger(logLevel as any);

  const fubClient = new FUBClient(
    env.FUB_API_KEY,
    env.FUB_X_SYSTEM,
    env.FUB_X_SYSTEM_KEY,
    requestTimeout
  );

  const ghlClient = new GHLClient(
    env.GHL_PRIVATE_TOKEN,
    env.GHL_LOCATION_ID,
    requestTimeout
  );

  toolHandler = new ToolHandler(fubClient, ghlClient, logLevel);
  rateLimiter = new RateLimiter(maxRequests, windowMs);
}

function createMCPResponse<T>(
  id: string | number,
  result?: T,
  error?: { code: number; message: string; data?: unknown }
): MCPResponse<T> {
  return {
    jsonrpc: "2.0",
    id,
    ...(result !== undefined && { result }),
    ...(error && { error }),
  };
}

async function handleMCPRequest(
  request: MCPRequest,
  env: CloudflareEnv,
  requestId: string
): Promise<MCPResponse> {
  const { method, params, id } = request;

  logger.info("MCP request received", {
    requestId,
    method,
    id,
  });

  try {
    switch (method) {
      case "search_fub_person": {
        const input = params as SearchFUBPersonInput;
        const result = await toolHandler.searchFUBPerson(input);
        logger.info("search_fub_person completed", { requestId, id });
        return createMCPResponse(id, result);
      }

      case "get_fub_person": {
        const input = params as unknown as GetFUBPersonInput;
        const result = await toolHandler.getFUBPerson(input);
        logger.info("get_fub_person completed", { requestId, id });
        return createMCPResponse(id, result);
      }

      case "create_or_update_ghl_contact": {
        const input = params as unknown as CreateOrUpdateGHLContactInput;
        const result = await toolHandler.createOrUpdateGHLContact(input);
        logger.info("create_or_update_ghl_contact completed", {
          requestId,
          id,
        });
        return createMCPResponse(id, result);
      }

      case "sync_fub_person_to_ghl": {
        const input = params as unknown as SyncFUBPersonToGHLInput;
        const result = await toolHandler.syncFUBPersonToGHL(input);
        logger.info("sync_fub_person_to_ghl completed", { requestId, id });
        return createMCPResponse(id, result);
      }

      case "create_ghl_opportunity_from_fub_deal": {
        const input = params as unknown as CreateGHLOpportunityFromFUBDealInput;
        const result = await toolHandler.createGHLOpportunityFromFUBDeal(input);
        logger.info("create_ghl_opportunity_from_fub_deal completed", {
          requestId,
          id,
        });
        return createMCPResponse(id, result);
      }

      case "health_check": {
        const result = toolHandler.healthCheck();
        logger.info("health_check completed", { requestId, id });
        return createMCPResponse(id, result);
      }

      default:
        logger.warn("Unknown MCP method", { requestId, method });
        return createMCPResponse(id, undefined, {
          code: -32601,
          message: `Unknown method: ${method}`,
        });
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logger.error("MCP request failed", {
      requestId,
      method,
      error: errorMessage,
    });

    return createMCPResponse(id, undefined, {
      code: -32603,
      message: errorMessage,
      data: { requestId },
    });
  }
}

async function handleRequest(
  request: Request,
  env: CloudflareEnv,
  ctx: ExecutionContext
): Promise<Response> {
  const requestId = generateRequestId();
  const clientIp = request.headers.get("cf-connecting-ip") || "unknown";

  logger?.info("HTTP request received", {
    requestId,
    method: request.method,
    url: request.url,
    clientIp,
  });

  // Initialize clients on first request
  if (!toolHandler) {
    initializeClients(env);
  }

  // Rate limiting per IP
  if (!rateLimiter.isAllowed(clientIp)) {
    logger.warn("Rate limit exceeded", { requestId, clientIp });
    return new Response(
      JSON.stringify({
        error: "Rate limit exceeded",
        remaining: 0,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "60",
        },
      }
    );
  }

  // Only accept POST requests
  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return new Response(
        JSON.stringify({ error: "Content-Type must be application/json" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const body = (await request.json()) as MCPRequest;

    // Validate MCP request structure
    if (!body.jsonrpc || !body.method || body.id === undefined) {
      logger.warn("Invalid MCP request", { requestId });
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: body.id || null,
          error: {
            code: -32600,
            message: "Invalid Request",
          },
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const response = await handleMCPRequest(body, env, requestId);

    const statusCode = response.error ? 400 : 200;
    const remaining = rateLimiter.getRemainingRequests(clientIp);

    return new Response(JSON.stringify(response), {
      status: statusCode,
      headers: {
        "Content-Type": "application/json",
        "X-Request-ID": requestId,
        "X-RateLimit-Remaining": String(remaining),
      },
    });
  } catch (error) {
    logger.error("Request handling failed", {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });

    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32603,
          message: "Internal server error",
          data: { requestId },
        },
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

export default {
  async fetch(
    request: Request,
    env: CloudflareEnv,
    ctx: ExecutionContext
  ): Promise<Response> {
    return handleRequest(request, env, ctx);
  },

  async scheduled(
    event: ScheduledEvent,
    env: CloudflareEnv,
    ctx: ExecutionContext
  ): Promise<void> {
    if (!logger) {
      initializeClients(env);
    }

    logger.info("Scheduled event triggered", {
      cron: event.cron,
      timestamp: new Date().toISOString(),
    });

    // Cleanup rate limiter
    rateLimiter.cleanup();
  },
};
