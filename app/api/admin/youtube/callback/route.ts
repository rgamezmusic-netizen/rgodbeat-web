import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { isYouTubeChannelAdmin } from "@/lib/youtube/config";
import { verifyOAuthState } from "@/lib/youtube/credentials";
import { exchangeYouTubeCode, getYouTubeChannelSettings, saveYouTubeChannelSettings } from "@/lib/youtube/channel";
import { encryptYouTubeToken } from "@/lib/youtube/credentials";
import { youtubeConfig } from "@/lib/youtube/config";

export const dynamic = "force-dynamic";

function back(request: NextRequest, outcome: "connected" | "error") {
  const url = new URL("/admin/youtube", request.url);
  url.searchParams.set(outcome, "1");
  const response = NextResponse.redirect(url);
  response.cookies.delete("rgodbeat_youtube_oauth");
  return response;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!isYouTubeChannelAdmin(user?.email)) return back(request, "error");
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state") || "";
  const [payload, signature] = state.split(".");
  const cookieNonce = request.cookies.get("rgodbeat_youtube_oauth")?.value;
  if (!code || !payload || !signature || !cookieNonce || !verifyOAuthState(payload, signature)) return back(request, "error");

  try {
    const stateData = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { nonce: string; userId: string; email: string; expiresAt: number };
    if (stateData.nonce !== cookieNonce || stateData.userId !== user!.id || stateData.email !== user!.email || stateData.expiresAt < Date.now()) return back(request, "error");
    const tokens = await exchangeYouTubeCode(code);
    const oldSettings = await getYouTubeChannelSettings();
    const refreshToken = tokens.refresh_token
      ? encryptYouTubeToken(tokens.refresh_token)
      : oldSettings?.encrypted_refresh_token;
    if (!refreshToken) return back(request, "error");
    const channelResponse = await fetch("https://youtube.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
      headers: { authorization: `Bearer ${tokens.access_token}` }, cache: "no-store",
    });
    const channelPayload = await channelResponse.json() as { items?: Array<{ id: string; snippet?: { title?: string } }> };
    const targetChannelId = youtubeConfig().channelId;
    const channels = channelPayload.items || [];
    const channel = channels.find((item) => item.id === targetChannelId);
    if (!channelResponse.ok || channels.length !== 1 || !channel?.id) return back(request, "error");
    await saveYouTubeChannelSettings({ channel_id: channel.id, channel_title: channel.snippet?.title || "Canal RGODBEAT", encrypted_refresh_token: refreshToken, updated_at: new Date().toISOString() });
    return back(request, "connected");
  } catch (error) {
    console.error("[YouTube OAuth] Connection failed:", error instanceof Error ? error.name : "Unknown error");
    return back(request, "error");
  }
}
