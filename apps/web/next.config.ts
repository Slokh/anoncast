import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@anon/credentials"],
  serverExternalPackages: ["@aztec/bb.js"],
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
