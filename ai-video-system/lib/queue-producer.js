// Render-queue producer — queue-optional.
//
// If the RENDER_QUEUE binding exists, sends a message and returns. Otherwise
// invokes the consumer logic inline via ctx.waitUntil — same end-state, just
// no Queue durability guarantees. This lets us deploy staging without the
// Cloudflare Queue provisioned.

import { processOne } from "./queue-consumer.js";

export async function enqueueOrInline(env, ctx, body) {
  if (env.RENDER_QUEUE && typeof env.RENDER_QUEUE.send === "function") {
    await env.RENDER_QUEUE.send(body);
    return { queued: true };
  }
  // No queue binding — process inline. ctx.waitUntil keeps the worker alive
  // past the response.
  ctx.waitUntil(
    processOne(env, body).catch(e =>
      console.error("inline processOne failed:", e.stack || e.message)
    )
  );
  return { queued: false, inline: true };
}
