import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptYouTubeToken, encryptYouTubeToken } from "@/lib/youtube/credentials";
import { youtubeConfig } from "@/lib/youtube/config";
import { googleYouTubeError, YouTubeError } from "@/lib/youtube/errors";

type ChannelSettings = { channel_id: string; channel_title: string; encrypted_refresh_token: string; updated_at: string };
type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string };

function settingsTable() {
  return createAdminClient().from("youtube_channel_settings");
}

export async function getYouTubeChannelSettings(): Promise<ChannelSettings | null> {
  const { data, error } = await settingsTable().select("channel_id,channel_title,encrypted_refresh_token,updated_at").eq("id", 1).maybeSingle();
  if (error) throw error;
  return data as ChannelSettings | null;
}

export async function saveYouTubeChannelSettings(value: ChannelSettings): Promise<void> {
  const { error } = await settingsTable().upsert({ id: 1, ...value }, { onConflict: "id" });
  if (error) throw error;
}

export async function removeYouTubeChannelSettings(): Promise<void> {
  const { error } = await settingsTable().delete().eq("id", 1);
  if (error) throw error;
}

export async function exchangeYouTubeCode(code: string): Promise<TokenResponse> {
  const clientId = process.env.YOUTUBE_CLIENT_ID?.trim();
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET?.trim();
  const redirectUri = process.env.YOUTUBE_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) throw new Error("YouTube OAuth is not configured.");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const result = await response.json() as TokenResponse;
  if (!response.ok || !result.access_token) throw new Error("Google did not authorize this channel.");
  return result;
}

export async function refreshYouTubeAccessToken(options: { requireUpload?: boolean } = {}): Promise<string> {
  const settings = await getYouTubeChannelSettings();
  const clientId = process.env.YOUTUBE_CLIENT_ID?.trim();
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new YouTubeError("channelConfiguration");
  if (!settings) throw new YouTubeError("channelAuthorization");
  let refreshToken: string;
  try { refreshToken = decryptYouTubeToken(settings.encrypted_refresh_token); }
  catch { throw new YouTubeError("channelAuthorization"); }
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token" }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const result = await response.json() as TokenResponse;
  if (!response.ok || !result.access_token) throw new YouTubeError(result.error === "invalid_client" ? "channelConfiguration" : "channelAuthorization");
  if (options.requireUpload) {
    // Google can grant only part of the requested consent. Reading a channel
    // successfully does not prove that this token is allowed to upload videos.
    const granted = new Set(result.scope?.split(/\s+/) || []);
    const uploadScopes = ['youtube.upload', 'youtube', 'youtube.force-ssl', 'youtubepartner'];
    if (!uploadScopes.some(scope => granted.has(`https://www.googleapis.com/auth/${scope}`))) throw new YouTubeError('insufficientPermissions');
  }
  if (result.refresh_token) {
    await saveYouTubeChannelSettings({ ...settings, encrypted_refresh_token: encryptYouTubeToken(result.refresh_token), updated_at: new Date().toISOString() });
  }
  return result.access_token;
}

/** Read-only Google probe. A saved refresh token alone does not mean it still works. */
export async function getVerifiedYouTubeAccessToken(): Promise<string> {
  const targetChannelId = youtubeConfig().channelId;
  const settings = await getYouTubeChannelSettings();
  if (!targetChannelId || settings?.channel_id !== targetChannelId) throw new YouTubeError("channelMismatch");
  const accessToken = await refreshYouTubeAccessToken({ requireUpload: true });
  const response = await fetch("https://youtube.googleapis.com/youtube/v3/channels?part=id&mine=true", {
    headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(20_000),
  });
  const result = await response.json();
  if (!response.ok) throw googleYouTubeError(result, response.status);
  if (!result.items?.some((item: { id?: string }) => item.id === targetChannelId)) throw new YouTubeError("channelMismatch");
  return accessToken;
}
