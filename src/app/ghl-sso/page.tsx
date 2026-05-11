"use client";

import { useEffect, useState } from "react";

export default function GhlSsoHandshake() {
  const [status, setStatus] = useState("Connecting to GoHighLevel…");

  useEffect(() => {
    let done = false;

    const isGhlOrigin = (origin: string) => {
      try {
        const host = new URL(origin).hostname.toLowerCase();
        return (
          host === "app.gohighlevel.com" ||
          host === "app.leadconnectorhq.com" ||
          host.endsWith(".gohighlevel.com") ||
          host.endsWith(".leadconnectorhq.com") ||
          host.endsWith(".msgsndr.com") ||
          host.endsWith(".highlevel.com")
        );
      } catch {
        return false;
      }
    };

    const extractToken = (data: unknown): string | null => {
      if (!data) return null;
      if (typeof data === "string") {
        return data.length > 20 ? data : null;
      }
      if (typeof data !== "object") return null;
      const d = data as Record<string, unknown>;
      const inner =
        d.data && typeof d.data === "object"
          ? (d.data as Record<string, unknown>)
          : {};
      const userData =
        d.userData && typeof d.userData === "object"
          ? (d.userData as Record<string, unknown>)
          : {};
      const candidate =
        d.payload ??
        d.token ??
        d.ssoSession ??
        d.sso ??
        inner.payload ??
        inner.token ??
        inner.ssoSession ??
        inner.sso ??
        userData.payload ??
        userData.token ??
        userData.ssoSession;
      return typeof candidate === "string" && candidate.length > 20
        ? candidate
        : null;
    };

    const handler = (event: MessageEvent) => {
      console.log("[ghl-sso] message received", {
        origin: event.origin,
        type: typeof event.data,
        keys:
          event.data && typeof event.data === "object"
            ? Object.keys(event.data as object)
            : undefined,
        preview:
          typeof event.data === "string"
            ? event.data.slice(0, 60)
            : event.data,
      });
      if (!isGhlOrigin(event.origin)) {
        console.log("[ghl-sso] origin rejected:", event.origin);
        return;
      }
      const token = extractToken(event.data);
      if (!token) {
        console.log("[ghl-sso] no usable token in payload");
        return;
      }
      if (done) return;
      done = true;
      console.log(
        "[ghl-sso] redirecting with token (len=" + token.length + ")",
      );
      setStatus("Signing you in…");
      window.location.replace(
        `/api/auth/ghl-sso?sso-session=${encodeURIComponent(token)}`,
      );
    };

    window.addEventListener("message", handler);

    const requestUserData = (attempt: number) => {
      if (done) return;
      try {
        console.log("[ghl-sso] postMessage REQUEST_USER_DATA, attempt", attempt);
        window.parent?.postMessage({ message: "REQUEST_USER_DATA" }, "*");
      } catch (e) {
        console.error("[ghl-sso] postMessage failed", e);
      }
    };

    const timers: number[] = [];
    [0, 500, 1500, 3000].forEach((delay, i) => {
      timers.push(window.setTimeout(() => requestUserData(i + 1), delay));
    });

    const timeout = window.setTimeout(() => {
      if (done) return;
      setStatus(
        "Could not retrieve a GoHighLevel SSO session. Open DevTools → Console for diagnostic logs, then reload this page from inside the GHL sidebar.",
      );
    }, 12000);

    return () => {
      window.removeEventListener("message", handler);
      timers.forEach((t) => window.clearTimeout(t));
      window.clearTimeout(timeout);
    };
  }, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <p>{status}</p>
    </main>
  );
}
