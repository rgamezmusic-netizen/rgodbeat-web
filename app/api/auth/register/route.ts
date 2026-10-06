import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAuth } from "@/lib/auth/request";

export const dynamic = "force-dynamic";

const productionOrigins = new Set(["https://rgodbeat.com", "https://www.rgodbeat.com"]);

export async function POST(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const origin = new URL(request.url).origin;
    const suppliedOrigin = request.headers.get("origin");
    if (suppliedOrigin && suppliedOrigin !== origin
      && !(productionOrigins.has(origin) && productionOrigins.has(suppliedOrigin))) {
      return NextResponse.json({ error: "Solicitud no permitida." }, { status: 403, headers });
    }

    let body: { email?: unknown; password?: unknown; fullName?: unknown };
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: "Solicitud inválida." }, { status: 400, headers }); }
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Solicitud inválida." }, { status: 400, headers });
    }
    const { email, password, fullName } = body;

    const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const cleanPassword = typeof password === "string" ? password : "";
    const cleanName = typeof fullName === "string" ? fullName.trim().slice(0, 100) : "";

    // 1. Validations
    if (!cleanEmail || !cleanPassword) {
      return NextResponse.json(
        { error: "Por favor proporciona un correo electrónico y una contraseña." },
        { status: 400, headers }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (cleanEmail.length > 254 || !emailRegex.test(cleanEmail)) {
      return NextResponse.json(
        { error: "El formato del correo electrónico no es válido." },
        { status: 400, headers }
      );
    }

    if (cleanPassword.length < 8 || cleanPassword.length > 128) {
      return NextResponse.json(
        { error: "La contraseña debe tener entre 8 y 128 caracteres." },
        { status: 400, headers }
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      return NextResponse.json({ error: "El registro no está disponible. Inténtalo más tarde." }, { status: 503, headers });
    }

    // Use the public Auth signup flow. Supabase controls email confirmation,
    // duplicate-account obfuscation and signup rate limits; never auto-confirm
    // an address through the service-role API.
    const supabase = createSupabaseClient(url, key, {
      global: { fetch: fetchAuth },
      auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: signupData, error: signupError } = await supabase.auth.signUp({
      email: cleanEmail,
      password: cleanPassword,
      options: {
        emailRedirectTo: new URL("/login?confirmed=1", origin).toString(),
        data: { full_name: cleanName || cleanEmail.split("@")[0], role: "customer" },
      },
    });

    if (signupError) {
      const limited = signupError.status === 429 || /rate.limit|too.many/i.test(signupError.message);
      return NextResponse.json(
        { error: limited ? "Hay demasiados intentos. Espera unos minutos antes de volver a registrarte." : "No se pudo completar el registro. Revisa los datos e inténtalo de nuevo." },
        { status: limited ? 429 : 400, headers }
      );
    }

    if (!signupData?.user) {
      return NextResponse.json({ error: "No se pudo completar el registro." }, { status: 500, headers });
    }

    // Supabase returns an empty identities array for an existing email when
    // signup obfuscation is enabled. Do not reveal whether that account exists.
    if (signupData.user.identities?.length) {
      try {
        const admin = createAdminClient();
        const { error: customerError } = await admin.from("customers").upsert({
          id: signupData.user.id,
          email: cleanEmail,
          name: cleanName || cleanEmail.split("@")[0],
        }, { onConflict: "id" });
        if (customerError) console.error("[Register API] Customer sync failed:", customerError.code || "unknown");
      } catch (customerErr) {
        console.error("[Register API] Customer sync unavailable:", customerErr instanceof Error ? customerErr.name : "unknown");
      }
    }

    return NextResponse.json({ success: true, requiresEmailConfirmation: !signupData.session }, { headers });
  } catch (err) {
    console.error("[Register API] Unexpected failure:", err instanceof Error ? err.name : "unknown");
    return NextResponse.json(
      { error: "Error interno al procesar el registro. Inténtalo más tarde." },
      { status: 500, headers }
    );
  }
}
