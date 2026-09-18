import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    reactStrictMode: true,
    async headers() {
          return [
            {
                      source: "/:path*",
                      headers: [
                                  // Allow GHL iframe embedding of the dashboard, incl. white-label domains
                        { key: "Content-Security-Policy", value: "frame-ancestors 'self' https://*.gohighlevel.com https://*.leadconnectorhq.com https://*.msgsndr.com https://*.reallistingteam.com" },
                                ],
            },
                ];
    },
};

export default nextConfig;
