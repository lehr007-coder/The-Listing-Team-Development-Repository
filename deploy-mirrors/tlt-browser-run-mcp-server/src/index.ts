import { env } from 'cloudflare:workers';
import { createMcpAgent } from '@cloudflare/playwright-mcp';

export const PlaywrightMCP = createMcpAgent((env as any).BROWSER);

function authorized(request: Request, workerEnv: any) {
  const expected = String(workerEnv.BROWSER_MCP_INTERNAL_TOKEN || '');
  const header = request.headers.get('authorization') || '';
  return Boolean(expected && header.startsWith('Bearer ') && header.slice(7) === expected);
}

export default {
  fetch(request: Request, workerEnv: any, ctx: any) {
    const { pathname } = new URL(request.url);

    if (pathname === '/health') {
      return Response.json({
        ok: true,
        service: 'tlt-browser-run-mcp-server',
        runtime: 'cloudflare-browser-run',
        browser_binding_configured: Boolean(workerEnv.BROWSER),
        auth_configured: Boolean(workerEnv.BROWSER_MCP_INTERNAL_TOKEN),
        mcp_paths: ['/mcp', '/sse'],
        external_state_changes_require_approval: true
      });
    }

    if (!authorized(request, workerEnv)) {
      return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
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
