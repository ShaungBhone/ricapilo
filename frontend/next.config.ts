import type { NextConfig } from "next"
const nextConfig: NextConfig = {
  output: "standalone",
  experimental: { proxyClientMaxBodySize: "310mb" },
  async rewrites() {
    return [
      {
        source: "/api/backend/:path*",
        destination: `${process.env.API_INTERNAL_URL || "http://127.0.0.1:8000"}/:path*`,
      },
    ]
  },
}
export default nextConfig
