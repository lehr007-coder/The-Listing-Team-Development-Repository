import { env } from 'cloudflare:workers';
import { createMcpAgent } from '@cloudflare/playwright-mcp';

export const PlaywrightMCP = createMcpAgent((env as any).BROWSER);

export default {
  fetch(request: Request, workerEnv: any, ctx: any) {
    const { pathname } = new URL(request.url);

    if (pathname === '/health') {
      return Response.json({
        ok: true,
        service: 'tlt-browser-run-mcp-server',
        runtime: 'cloudflare-browser-run',
        browser_binding_configured: Boolean(workerEnv.BROWSER),
        mcp_paths: ['/mcp', '/sse'],
        external_state_changes_require_approval: true
      });
    }

    switch (pathname) {
      case '/sse':
      case '/sse/message':
        return PlaywrightMCP.serveSSE('/sse').fetch(request, workerEnv, ctx);
      case '/mcp':
        return PlaywrightMCP.serve('/mcp').fetch(request, workerEnv, ctx);
      default:
        return new Response('Not Found', { status: 404 });
    }
  }
};
