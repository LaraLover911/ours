import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: false,
  env: {
    // Shown on "Our Devices": the deployed commit, so you can see which devices run an old version.
    NEXT_PUBLIC_APP_VERSION: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
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
