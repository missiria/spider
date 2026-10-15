import type { NextConfig } from "next";

const apiTarget =
  process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8012";
const normalizedApiTarget = apiTarget.replace(/\/$/, "");

const nextConfig: NextConfig = {
  devIndicators: {
    position: "bottom-right",
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${normalizedApiTarget}/:path*`,
      },
    ];
  },
};

export default nextConfig;
