import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { safeAuthRedirect } from "@/lib/auth/redirect";

export async function POST(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  const origin = new URL(request.url).origin;
  if (request.headers.get("origin") && request.headers.get("origin") !== origin) return NextResponse.json({ error: "Solicitud no permitida." }, { status: 403, headers });
  let body: { email?: unknown; next?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud inválida." }, { status: 400, headers }); }
  if (!body || typeof body.email !== "string") return NextResponse.json({ error: "Escribe el correo de tu cuenta." }, { status: 400, headers });
  const email = body.email.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Escribe un correo válido." }, { status: 400, headers });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.json({ error: "La recuperación no está disponible. Inténtalo más tarde." }, { status: 503, headers });
  const redirect = new URL("/reset-password", origin);
  if (typeof body.next === "string") redirect.searchParams.set("next", safeAuthRedirect(body.next, "/account"));
  // Public Auth API, without the service key or a browser-specific PKCE verifier.
  // Supabase still controls email verification, token expiry, CAPTCHA and rate limits.
  const supabase = createClient(url, key, { auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirect.toString() });
    if (error) {
      const limited = error.status === 429 || /rate.limit|too.many/i.test(error.message);
      return NextResponse.json({ error: limited ? "Hay demasiados intentos. Espera unos minutos antes de pedir otro enlace." : "No se pudo enviar el correo de recuperación. Inténtalo más tarde." }, { status: limited ? 429 : 503, headers });
    }
    return NextResponse.json({ message: "Si ese correo tiene una cuenta, recibirás un enlace para cambiar tu contraseña. Revisa también Spam." }, { headers });
  } catch { return NextResponse.json({ error: "No pudimos conectar con el servicio de correo. Inténtalo más tarde." }, { status: 503, headers }); }
}
