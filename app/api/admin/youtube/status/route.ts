import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { isYouTubeChannelAdmin, youtubeConfig } from "@/lib/youtube/config";
import { getYouTubeChannelSettings } from "@/lib/youtube/channel";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!isYouTubeChannelAdmin(user?.email)) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const config = youtubeConfig();
  let channel = null;
  if (config.configured && config.validKey) {
    try { channel = await getYouTubeChannelSettings(); } catch { /* The migration may not have been applied yet. */ }
  }
  return NextResponse.json({ configured: config.configured && config.validKey, connected: Boolean(channel), channel: channel ? { id: channel.channel_id, title: channel.channel_title } : null });
}
