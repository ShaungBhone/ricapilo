import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1"],
  experimental: { proxyClientMaxBodySize: "310mb" },
  async rewrites() {
    return [
      {
        source: "/api/backend/:path*",
        destination: `${process.env.API_INTERNAL_URL || "http://127.0.0.1:8000"}/:path*`,
      },
    ];
  },
};
export default createNextIntlPlugin()(nextConfig);
