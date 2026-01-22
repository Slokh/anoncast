import type { NextConfig } from "next";
import { config } from "dotenv";
import { resolve } from "path";

// Load env from monorepo root
config({ path: resolve(__dirname, "../../.env") });

const nextConfig: NextConfig = {
  transpilePackages: ["@anon/protocol", "@anon/sdk"],
  serverExternalPackages: ["@aztec/bb.js"],
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
