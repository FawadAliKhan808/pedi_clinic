import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  rewrites() {
    return [
      // The demo-day slide deck (a standalone page in public/), at a clean URL.
      { source: "/demo-ppt", destination: "/demo-ppt.html" },
    ];
  },
};

export default nextConfig;
