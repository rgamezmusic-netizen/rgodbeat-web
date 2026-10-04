import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { isYouTubeChannelAdmin, youtubeConfig } from "@/lib/youtube/config";
import { signOAuthState } from "@/lib/youtube/credentials";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!isYouTubeChannelAdmin(user?.email)) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const config = youtubeConfig();
  if (!config.configured || !config.validKey) return NextResponse.json({ error: "Falta completar la configuración de YouTube en el servidor." }, { status: 503 });

  const nonce = randomBytes(32).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ nonce, userId: user!.id, email: user!.email, expiresAt: Date.now() + 10 * 60_000 })).toString("base64url");
  const state = `${payload}.${signOAuthState(payload)}`;
  const google = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  google.search = new URLSearchParams({
    client_id: config.clientId!, redirect_uri: config.redirectUri!, response_type: "code", access_type: "offline",
    prompt: "consent", include_granted_scopes: "true", scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly", state,
  }).toString();

  const response = NextResponse.redirect(google);
  response.cookies.set("rgodbeat_youtube_oauth", nonce, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/admin/youtube/callback", maxAge: 600 });
  return response;
}
