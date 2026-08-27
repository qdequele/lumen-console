import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output is for the Docker image; Vercel does its own output
  // tracing and the two conflict (missing .nft.json at build time).
  output: process.env.VERCEL ? undefined : "standalone",
};

export default nextConfig;
