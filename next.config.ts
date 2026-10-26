import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseHostname = (() => {
  if (!supabaseUrl) return null;
  try {
    const parsed = new URL(supabaseUrl);
    return parsed.protocol === "https:" || parsed.hostname === "localhost" ? parsed.hostname : null;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  async headers() {
    return [{
      source: '/manifest.json',
      headers: [{ key: 'Content-Type', value: 'application/manifest+json' }],
    }];
  },
  images: {
    formats: ["image/webp"],
    remotePatterns: supabaseHostname ? [{
      protocol: supabaseHostname === "localhost" ? "http" : "https",
      hostname: supabaseHostname,
      pathname: "/storage/v1/object/public/rgodbeat-public/**",
    }] : [],
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
    // Keep completed page payloads when navigating away and back.
    staleTimes: { dynamic: 300, static: 300 },
    serverActions: {
      bodySizeLimit: "250mb",
    },
    proxyClientMaxBodySize: "250mb",
  },
};

export default nextConfig;
