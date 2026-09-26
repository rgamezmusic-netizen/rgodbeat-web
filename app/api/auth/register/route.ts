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

    // 2. Check if user already exists
    const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      console.error("[Register API] Error checking existing users:", listError);
    }

    const existingUser = usersData?.users?.find(
      (u) => u.email?.toLowerCase() === cleanEmail
    );

    if (existingUser) {
      // If user exists but email was NEVER confirmed (e.g. stuck from previous attempts)
      if (!existingUser.email_confirmed_at) {
        console.log(`[Register API] Unconfirmed user ${cleanEmail} found. Auto-confirming and updating password.`);
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
          existingUser.id,
          {
            password: cleanPassword,
            email_confirm: true,
            user_metadata: {
              full_name: cleanName || existingUser.user_metadata?.full_name || cleanEmail.split("@")[0],
              role: "customer",
            },
          }
        );

        if (updateError) {
          return NextResponse.json(
            { error: "No se pudo reactivar la cuenta. Inténtalo de nuevo." },
            { status: 400 }
          );
        }

        // Upsert customer profile
        await supabaseAdmin.from("customers").upsert(
          {
            id: existingUser.id,
            email: cleanEmail,
            name: cleanName || existingUser.user_metadata?.full_name || cleanEmail.split("@")[0],
          },
          { onConflict: "id" }
        );

        return NextResponse.json({
          success: true,
          user: { id: existingUser.id, email: cleanEmail },
          message: "Cuenta verificada exitosamente.",
        });
      }

      // If user is already registered and confirmed
      return NextResponse.json(
        { error: "Ya existe una cuenta con este correo. Por favor inicia sesión con tu contraseña." },
        { status: 409 }
      );
    }

    // 3. Create user with email_confirm: true (bypasses Supabase SMTP rate limits & instantly activates account)
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

    // 4. Upsert into public.customers table
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
