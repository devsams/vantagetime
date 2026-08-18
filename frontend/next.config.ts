import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // produces a lean, self-contained build for Docker/Cloud Run
};

export default nextConfig;
