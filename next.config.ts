import type { NextConfig } from "next";

const kpiDashboardHosts = [
  "kpi.tribe-neon.com",
  "kpi-preview.tribe-neon.com",
];

const nextConfig: NextConfig = {
  // Visual acceptance screenshots must represent the release canvas rather
  // than the Next.js development toolbar badge.
  devIndicators: false,
  async redirects() {
    return kpiDashboardHosts.map((host) => ({
      source: "/",
      has: [{ type: "host" as const, value: host.replaceAll(".", "\\.") }],
      destination: "/admin/kpi",
      permanent: false,
    }));
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
