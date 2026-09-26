import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email } = body;

    const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

    if (!cleanEmail) {
      return NextResponse.json({ error: "Email requerido." }, { status: 400 });
    }

    const supabaseAdmin = createAdminClient();

    // Check user in Supabase auth
    const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) {
      console.error("[Confirm-User API] listUsers error:", listError);
      return NextResponse.json({ error: "Error consultando usuario." }, { status: 500 });
    }

    const targetUser = usersData?.users?.find(
      (u) => u.email?.toLowerCase() === cleanEmail
    );

    if (!targetUser) {
      return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
    }

    // If already confirmed, nothing to do
    if (targetUser.email_confirmed_at) {
      return NextResponse.json({ success: true, alreadyConfirmed: true });
    }

    // Auto-confirm the user
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      targetUser.id,
      {
        email_confirm: true,
      }
    );

    if (updateError) {
      console.error("[Confirm-User API] Error confirming user:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Ensure customer row exists
    await supabaseAdmin.from("customers").upsert(
      {
        id: targetUser.id,
        email: cleanEmail,
        name: targetUser.user_metadata?.full_name || cleanEmail.split("@")[0],
      },
      { onConflict: "id" }
    );

    return NextResponse.json({
      success: true,
      message: "Usuario confirmado automáticamente.",
    });
  } catch (err: any) {
    console.error("[Confirm-User API] Unexpected error:", err);
    return NextResponse.json(
      { error: err.message || "Error al auto-confirmar usuario." },
      { status: 500 }
    );
  }
}
