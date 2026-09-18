"use client";
import { createElement, useEffect, useState } from "react";

const isGhlOrigin = (origin: string) => {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return (
      host === "app.gohighlevel.com" ||
      host === "app.leadconnectorhq.com" ||
      host.endsWith(".gohighlevel.com") ||
      host.endsWith(".leadconnectorhq.com") ||
      host.endsWith(".msgsndr.com") ||
      host.endsWith(".highlevel.com") || host.endsWith(".reallistingteam.com")
    );
  } catch {
    return false;
  }
};

export default function SsoHandshake() {
  const [status, setStatus] = useState("Connecting to GoHighLevel...");
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      console.log("[sso] msg", event.origin, event.data);
      if (!isGhlOrigin(event.origin)) {
        console.log("[sso] origin rejected:", event.origin);
        return;
      }
      const data: any = event.data;
      if (!data) return;
      let token: string | undefined;
      if (typeof data === "string" && data.length > 20) token = data;
      else if (typeof data === "object") {
        token = data.payload || data.token || data.ssoSession || data.sso;
        if (!token && data.message && typeof data.message === "object") token = data.message.payload || data.message.token;
      }
      if (!token || typeof token !== "string") return;
      setStatus("Signing you in...");
      window.location.replace("/api/auth/ghl-sso?sso-session=" + encodeURIComponent(token));
    };
    window.addEventListener("message", handler);
    const ask = () => { try { window.parent && window.parent.postMessage({ message: "REQUEST_USER_DATA" }, "*"); } catch (e) {} };
    ask();
    const r1 = setTimeout(ask, 500);
    const r2 = setTimeout(ask, 1500);
    const r3 = setTimeout(ask, 3000);
    const t = setTimeout(() => setStatus("Could not retrieve a GoHighLevel SSO session. Please open this page from the GHL sidebar."), 12000);
    return () => { window.removeEventListener("message", handler); clearTimeout(t); clearTimeout(r1); clearTimeout(r2); clearTimeout(r3); };
  }, []);
  return createElement("main", { style: { fontFamily: "system-ui, sans-serif", padding: 24 } }, createElement("p", null, status));
}
