import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, fullName } = body;

    const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const cleanPassword = typeof password === "string" ? password : "";
    const cleanName = typeof fullName === "string" ? fullName.trim() : "";

    // 1. Validations
    if (!cleanEmail || !cleanPassword) {
      return NextResponse.json(
        { error: "Por favor proporciona un correo electrónico y una contraseña." },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return NextResponse.json(
        { error: "El formato del correo electrónico no es válido." },
        { status: 400 }
      );
    }

    if (cleanPassword.length < 6) {
      return NextResponse.json(
        { error: "La contraseña debe tener un mínimo de 6 caracteres." },
        { status: 400 }
      );
    }

    const supabaseAdmin = createAdminClient();

    // Creating the account is the authoritative duplicate check. Listing auth
    // users first added latency, only inspected the first page, and raced with
    // simultaneous signups for the same address.
    // Create user with email_confirm: true (bypasses Supabase SMTP rate limits & instantly activates account)
    const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password: cleanPassword,
      email_confirm: true,
      user_metadata: {
        full_name: cleanName || cleanEmail.split("@")[0],
        role: "customer",
      },
    });

    if (createError) {
      console.error("[Register API] Error creating user:", createError);
      return NextResponse.json(
        { error: createError.message || "Error al crear la cuenta en el servidor." },
        { status: 400 }
      );
    }

    if (!createData?.user) {
      return NextResponse.json(
        { error: "No se pudo completar el registro." },
        { status: 500 }
      );
    }

    // Upsert into public.customers table
    try {
      await supabaseAdmin.from("customers").upsert(
        {
          id: createData.user.id,
          email: cleanEmail,
          name: cleanName || cleanEmail.split("@")[0],
        },
        { onConflict: "id" }
      );
    } catch (customerErr) {
      console.error("[Register API] Error syncing customer record:", customerErr);
    }

    return NextResponse.json({
      success: true,
      user: {
        id: createData.user.id,
        email: createData.user.email,
      },
      message: "¡Cuenta creada exitosamente!",
    });
  } catch (err: any) {
    console.error("[Register API] Unexpected error:", err);
    return NextResponse.json(
      { error: err.message || "Error interno del servidor al procesar el registro." },
      { status: 500 }
    );
  }
}
