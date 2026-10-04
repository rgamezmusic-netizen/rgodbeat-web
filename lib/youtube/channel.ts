import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptYouTubeToken, encryptYouTubeToken } from "@/lib/youtube/credentials";

type ChannelSettings = { channel_id: string; channel_title: string; encrypted_refresh_token: string; updated_at: string };
type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };

function settingsTable() {
  return (createAdminClient() as any).from("youtube_channel_settings");
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
  });
  const result = await response.json() as TokenResponse;
  if (!response.ok || !result.access_token) throw new Error("Google did not authorize this channel.");
  return result;
}

export async function refreshYouTubeAccessToken(): Promise<string> {
  const settings = await getYouTubeChannelSettings();
  const clientId = process.env.YOUTUBE_CLIENT_ID?.trim();
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET?.trim();
  if (!settings || !clientId || !clientSecret) throw new Error("The RGODBEAT YouTube channel is not connected.");
  const refreshToken = decryptYouTubeToken(settings.encrypted_refresh_token);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token" }),
    cache: "no-store",
  });
  const result = await response.json() as TokenResponse;
  if (!response.ok || !result.access_token) throw new Error("Could not refresh RGODBEAT YouTube authorization.");
  if (result.refresh_token) {
    await saveYouTubeChannelSettings({ ...settings, encrypted_refresh_token: encryptYouTubeToken(result.refresh_token), updated_at: new Date().toISOString() });
  }
  return result.access_token;
}
