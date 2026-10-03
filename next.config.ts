import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  redirects() {
    return [
      // The pharmacy moved from the doctor's /admin to its own /pharmacy.
      { source: "/admin/feed", destination: "/pharmacy/feed", permanent: false },
      { source: "/admin/stock", destination: "/pharmacy/stock", permanent: false },
    ];
  },
  rewrites() {
    return [
      // The demo-day slide deck (a standalone page in public/), at a clean URL.
      { source: "/demo-ppt", destination: "/demo-ppt.html" },
    ];
  },
};

export default nextConfig;
