import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: false,
  env: {
    // Shown on "Our Devices": the deployed commit, so you can see which devices run an old version.
    NEXT_PUBLIC_APP_VERSION: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
  },
  
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          // Camera and microphone only for this site (calls, voice notes), never location.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), interest-cohort=()" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
