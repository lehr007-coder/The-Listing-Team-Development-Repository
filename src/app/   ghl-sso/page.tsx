"use client";

import { useEffect, useState } from "react";

export default function GhlSsoHandshake() {
  const [status, setStatus] = useState("Connecting to GoHighLevel…");

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (
        !event.origin.endsWith(".gohighlevel.com") &&
        !event.origin.endsWith(".leadconnectorhq.com") &&
        !event.origin.endsWith(".msgsndr.com")
      ) {
        return;
      }
      const data = event.data;
      const token =
        typeof data === "string"
          ? data
          : data?.payload || data?.token || data?.ssoSession;
      if (!token) return;
      setStatus("Signing you in…");
      window.location.replace(
        `/api/auth/ghl-sso?sso-session=${encodeURIComponent(token)}`,
      );
    };

    window.addEventListener("message", handler);
    window.parent?.postMessage({ message: "REQUEST_USER_DATA" }, "*");

    const t = setTimeout(() => {
      setStatus(
        "Could not retrieve a GoHighLevel SSO session. Please reload this page from inside the GHL sidebar.",
      );
    }, 8000);

    return () => {
      window.removeEventListener("message", handler);
      clearTimeout(t);
    };
  }, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <p>{status}</p>
    </main>
  );
}
