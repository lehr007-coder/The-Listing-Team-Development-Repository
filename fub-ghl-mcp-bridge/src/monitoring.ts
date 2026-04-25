/**
 * Monitoring Script for FUB-GHL MCP Bridge
 *
 * Usage: npx ts-node src/monitoring.ts
 *
 * Monitors:
 * - Health check status
 * - Response times
 * - Error rates
 * - Rate limiting
 */

interface MonitoringConfig {
  workerUrl: string;
  checkInterval: number; // milliseconds
  alertThreshold: {
    responseTime: number; // milliseconds
    errorRate: number; // percentage (0-100)
    consecutiveFailures: number;
  };
  slackWebhook?: string; // Optional Slack integration
}

interface HealthCheckResponse {
  jsonrpc: string;
  id: number;
  result?: {
    status: string;
    service: string;
    timestamp: string;
    version?: string;
  };
  error?: {
    code: number;
    message: string;
  };
}

interface MetricsWindow {
  timestamp: Date;
  responseTime: number;
  success: boolean;
  statusCode: number;
  errorMessage?: string;
}

class ServiceMonitor {
  private config: MonitoringConfig;
  private metrics: MetricsWindow[] = [];
  private consecutiveFailures: number = 0;
  private alertSent: boolean = false;

  constructor(config: MonitoringConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    console.log("================================================");
    console.log("FUB-GHL MCP Bridge - Service Monitor");
    console.log("================================================");
    console.log(`Worker URL: ${this.config.workerUrl}`);
    console.log(`Check Interval: ${this.config.checkInterval}ms`);
    console.log("");

    // Run initial check
    await this.performCheck();

    // Schedule recurring checks
    setInterval(() => this.performCheck(), this.config.checkInterval);
  }

  private async performCheck(): Promise<void> {
    const startTime = Date.now();

    try {
      const response = await fetch(this.config.workerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Math.random(),
          method: "health_check",
          params: {},
        }),
      });

      const responseTime = Date.now() - startTime;
      const data = (await response.json()) as HealthCheckResponse;

      // Record metric
      this.metrics.push({
        timestamp: new Date(),
        responseTime,
        success: response.ok && data.result?.status === "ok",
        statusCode: response.status,
      });

      // Keep only last 100 checks in memory
      if (this.metrics.length > 100) {
        this.metrics.shift();
      }

      if (response.ok && data.result?.status === "ok") {
        this.consecutiveFailures = 0;
        this.alertSent = false;

        if (responseTime > this.config.alertThreshold.responseTime) {
          this.logWarning(
            `Slow response time: ${responseTime}ms (threshold: ${this.config.alertThreshold.responseTime}ms)`
          );
        } else {
          this.logSuccess(`Health check passed (${responseTime}ms)`);
        }
      } else {
        this.consecutiveFailures++;
        this.logError(
          `Health check failed: ${data.error?.message || "Unknown error"}`
        );

        if (
          this.consecutiveFailures >=
          this.config.alertThreshold.consecutiveFailures
        ) {
          await this.sendAlert(
            `Service down: ${this.consecutiveFailures} consecutive failures`
          );
        }
      }
    } catch (error) {
      this.consecutiveFailures++;
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logError(`Request failed: ${errorMessage}`);

      if (
        this.consecutiveFailures >=
        this.config.alertThreshold.consecutiveFailures
      ) {
        await this.sendAlert(
          `Service unreachable: ${this.consecutiveFailures} consecutive failures`
        );
      }
    }
  }

  private calculateMetrics() {
    if (this.metrics.length === 0) {
      return {
        avgResponseTime: 0,
        maxResponseTime: 0,
        minResponseTime: 0,
        errorRate: 0,
        uptime: 0,
      };
    }

    const responseTimes = this.metrics
      .filter((m) => m.success)
      .map((m) => m.responseTime);
    const errors = this.metrics.filter((m) => !m.success).length;

    return {
      avgResponseTime:
        responseTimes.length > 0
          ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
          : 0,
      maxResponseTime: Math.max(...this.metrics.map((m) => m.responseTime)),
      minResponseTime: Math.min(...this.metrics.map((m) => m.responseTime)),
      errorRate: (errors / this.metrics.length) * 100,
      uptime: ((this.metrics.length - errors) / this.metrics.length) * 100,
    };
  }

  private logSuccess(message: string): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ✓ ${message}`);
  }

  private logWarning(message: string): void {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}] ⚠ ${message}`);
  }

  private logError(message: string): void {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ✗ ${message}`);
  }

  private async sendAlert(message: string): Promise<void> {
    if (this.alertSent) {
      return; // Avoid duplicate alerts
    }

    this.alertSent = true;

    console.error("");
    console.error("================================================");
    console.error("🚨 ALERT");
    console.error("================================================");
    console.error(message);
    console.error("");

    const metrics = this.calculateMetrics();
    console.error("Current Metrics:");
    console.error(`  - Uptime: ${metrics.uptime.toFixed(2)}%`);
    console.error(`  - Error Rate: ${metrics.errorRate.toFixed(2)}%`);
    console.error(`  - Avg Response: ${metrics.avgResponseTime.toFixed(0)}ms`);
    console.error("");

    // Send to Slack if webhook configured
    if (this.config.slackWebhook) {
      try {
        await this.sendSlackAlert(message, metrics);
      } catch (error) {
        console.error(
          "Failed to send Slack alert:",
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    console.error("================================================");
    console.error("");
  }

  private async sendSlackAlert(
    message: string,
    metrics: ReturnType<ServiceMonitor["calculateMetrics"]>
  ): Promise<void> {
    if (!this.config.slackWebhook) return;

    const payload = {
      text: "🚨 FUB-GHL MCP Bridge Alert",
      attachments: [
        {
          color: "danger",
          fields: [
            {
              title: "Issue",
              value: message,
              short: false,
            },
            {
              title: "Uptime",
              value: `${metrics.uptime.toFixed(2)}%`,
              short: true,
            },
            {
              title: "Error Rate",
              value: `${metrics.errorRate.toFixed(2)}%`,
              short: true,
            },
            {
              title: "Avg Response",
              value: `${metrics.avgResponseTime.toFixed(0)}ms`,
              short: true,
            },
            {
              title: "Max Response",
              value: `${metrics.maxResponseTime}ms`,
              short: true,
            },
            {
              title: "Timestamp",
              value: new Date().toISOString(),
              short: false,
            },
          ],
        },
      ],
    };

    await fetch(this.config.slackWebhook, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async printStatus(): Promise<void> {
    const metrics = this.calculateMetrics();

    console.log("");
    console.log("Current Status:");
    console.log(`  Checks: ${this.metrics.length}`);
    console.log(`  Uptime: ${metrics.uptime.toFixed(2)}%`);
    console.log(`  Error Rate: ${metrics.errorRate.toFixed(2)}%`);
    console.log(`  Avg Response: ${metrics.avgResponseTime.toFixed(0)}ms`);
    console.log(`  Min Response: ${metrics.minResponseTime}ms`);
    console.log(`  Max Response: ${metrics.maxResponseTime}ms`);
    console.log(`  Consecutive Failures: ${this.consecutiveFailures}`);
    console.log("");
  }
}

// Configuration
const config: MonitoringConfig = {
  workerUrl: process.env.WORKER_URL || "https://fub-ghl-mcp-bridge.example.workers.dev",
  checkInterval: parseInt(process.env.CHECK_INTERVAL || "30000", 10), // 30 seconds
  alertThreshold: {
    responseTime: 5000, // 5 seconds
    errorRate: 10, // 10%
    consecutiveFailures: 3,
  },
  slackWebhook: process.env.SLACK_WEBHOOK_URL,
};

// Validate worker URL
if (
  !config.workerUrl ||
  config.workerUrl === "https://fub-ghl-mcp-bridge.example.workers.dev"
) {
  console.error(
    "Error: WORKER_URL environment variable not set or using example URL"
  );
  console.error(
    "Set it with: export WORKER_URL=https://your-worker.workers.dev"
  );
  process.exit(1);
}

// Start monitoring
const monitor = new ServiceMonitor(config);
monitor.start();

// Print status every 5 minutes
setInterval(() => monitor.printStatus(), 5 * 60 * 1000);

// Handle shutdown
process.on("SIGINT", () => {
  console.log("");
  console.log("Shutting down monitor...");
  process.exit(0);
});
