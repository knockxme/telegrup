import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Source maps roughly double peak build memory. Not worth it on a
  // memory-constrained deploy host — the "next build" step gets OOM-killed
  // (exit 137) before it even reaches typecheck otherwise.
  productionBrowserSourceMaps: false,
  experimental: {
    serverSourceMaps: false,
  },
};

export default nextConfig;
