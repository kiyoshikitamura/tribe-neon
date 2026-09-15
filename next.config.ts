import type { NextConfig } from "next";

const kpiDashboardHosts = [
  "kpi.tribe-neon.com",
  "kpi-preview.tribe-neon.com",
];

// This dedicated acceptance branch uses the already-enabled Preview Room API.
// Keep Production and other Preview branches on their existing deployment flags.
const raidAcceptancePreview = process.env.VERCEL_ENV === "preview"
  && process.env.VERCEL_GIT_COMMIT_REF === "codex/formal-open-integration-preview-20260914"
  && process.env.NEXT_PUBLIC_SUPABASE_URL === "https://sufvuqdnqohpfzkwxohq.supabase.co";

const nextConfig: NextConfig = {
  ...(raidAcceptancePreview ? { env: { NEXT_PUBLIC_RAID_ROOM_UI_ENABLED: "true" } } : {}),
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
