import type { NextConfig } from "next";

const apiTarget =
  process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8012";
const normalizedApiTarget = apiTarget.replace(/\/$/, "");

const nextConfig: NextConfig = {
  devIndicators: {
    position: "bottom-right",
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
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
