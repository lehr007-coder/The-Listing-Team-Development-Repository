import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Allow GHL iframe embedding of the dashboard
          { key: "Content-Security-Policy", value: "frame-ancestors 'self' https://*.gohighlevel.com https://*.leadconnectorhq.com https://*.msgsndr.com" },
          { key: "X-Frame-Options", value: "ALLOW-FROM https://app.gohighlevel.com" },
        ],
      },
    ];
  },
};

export default nextConfig;
