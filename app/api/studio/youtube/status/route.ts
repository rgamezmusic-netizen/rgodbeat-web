import { NextResponse } from "next/server";
import { existsSync } from "node:fs";
import ffmpegPath from "ffmpeg-static";
import { getAuthorizedStudioExporter } from "@/lib/youtube/access";
import { getYouTubeChannelSettings } from "@/lib/youtube/channel";
import { youtubeConfig } from "@/lib/youtube/config";
import { isYouTubeR2Configured } from "@/lib/youtube/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await getAuthorizedStudioExporter();
  if (!access.user) return NextResponse.json({ available: false, error: access.error }, { status: access.status });
  const config = youtubeConfig();
  let channel = null;
  try { if (config.configured && config.validKey) channel = await getYouTubeChannelSettings(); } catch { /* Migration or connection is not ready yet. */ }
  const rendererReady = Boolean(ffmpegPath && existsSync(ffmpegPath));
  const channelMatchesTarget = Boolean(channel && channel.channel_id === config.channelId);
  const storageReady = isYouTubeR2Configured();
  const error = !config.configured || !config.validKey
    ? "Falta configurar Google OAuth en el servidor."
    : !channelMatchesTarget
      ? "La cuenta propietaria debe conectar el canal RGODBEAT en Administración → YouTube."
      : !storageReady
        ? "Falta el bucket privado de YouTube y sus credenciales de R2."
        : !rendererReady
          ? "Vercel todavía no incluye el conversor de vídeo."
          : null;
  return NextResponse.json({
    available: Boolean(config.configured && config.validKey && channelMatchesTarget && rendererReady && storageReady),
    connected: channelMatchesTarget, channelName: channelMatchesTarget ? channel?.channel_title || null : null,
    rendererReady, storageReady, error, maxMasterBytes: 256_000_000, maxCoverBytes: 4_000_000,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
