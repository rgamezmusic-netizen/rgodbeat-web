import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "250mb",
    },
    proxyClientMaxBodySize: "250mb",
  },
};

export default nextConfig;
