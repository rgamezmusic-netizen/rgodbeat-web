import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/studio/youtube/publish": ["./node_modules/ffmpeg-static/ffmpeg", "./public/images/rgodbeat-studio-logo.png"],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "250mb",
    },
    proxyClientMaxBodySize: "250mb",
  },
};

export default nextConfig;
