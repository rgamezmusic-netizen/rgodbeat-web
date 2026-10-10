import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    formats: ["image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "https://wrcdapajrsuqgpbfadff.supabase.co").hostname,
        pathname: "/storage/v1/object/public/rgodbeat-public/**",
      },
    ],
  },
  outputFileTracingIncludes: {
    "/api/download/*": ["./public/images/rgodbeat-logo.png"],
    // This binary is checked in the admin page and Studio status route as
    // well as executed in the publish route. Trace it in each server bundle.
    "/admin/youtube": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/studio/youtube/status": ["./node_modules/ffmpeg-static/ffmpeg"],
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
