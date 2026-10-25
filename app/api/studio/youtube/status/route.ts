import { NextResponse } from "next/server";
import { getAuthorizedStudioExporter } from "@/lib/youtube/access";
import { getYouTubeChannelSettings, getVerifiedYouTubeAccessToken } from "@/lib/youtube/channel";
import { youtubeFailure } from "@/lib/youtube/errors";
import { youtubeConfig } from "@/lib/youtube/config";
import { isYouTubeFfmpegReady } from "@/lib/youtube/ffmpeg";
import { isYouTubeR2Configured } from "@/lib/youtube/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await getAuthorizedStudioExporter();
  if (!access.user) return NextResponse.json({ available: false, error: access.error }, { status: access.status });
  const config = youtubeConfig();
  let channel = null;
  try { if (config.configured && config.validKey) channel = await getYouTubeChannelSettings(); } catch { /* Migration or connection is not ready yet. */ }
  const rendererReady = isYouTubeFfmpegReady();
  const channelMatchesTarget = Boolean(channel && channel.channel_id === config.channelId);
  const storageReady = isYouTubeR2Configured();
  let error = !config.configured || !config.validKey
    ? "Falta configurar Google OAuth en el servidor."
    : !channelMatchesTarget
      ? "La cuenta propietaria debe conectar el canal RGODBEAT en Administración → YouTube."
      : !storageReady
        ? "Falta el bucket privado de YouTube y sus credenciales de R2."
        : !rendererReady
          ? "Vercel todavía no incluye el conversor de vídeo."
          : null;
  let authorizationVerified = false;
  let code: string | null = null;
  if (!error) {
    try { await getVerifiedYouTubeAccessToken(); authorizationVerified = true; }
    catch (failure) {
      const result = youtubeFailure(failure, 'channelAuthorization');
      error = result.message; code = result.code;
      console.error('[YouTube authorization check]', result.code);
    }
  }
  return NextResponse.json({
    available: authorizationVerified,
    connected: channelMatchesTarget, channelName: channelMatchesTarget ? channel?.channel_title || null : null,
    authorizationVerified, rendererReady, storageReady, error, code, maxMasterBytes: 256_000_000, maxCoverBytes: 4_000_000,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
