import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { grantStudioAccess } from "@/lib/commerce/fulfillment";

const ADMIN_EMAILS = [
  "admin@rgodbeat.com",
  "rgamezmusic@gmail.com",
  "rgodbeat@gmail.com",
];

export const dynamic = "force-dynamic";

// GET: List all customers with their studio access status
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.email || !ADMIN_EMAILS.includes(user.email.toLowerCase())) {
      return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    }

    const supabase = createAdminClient();
    const { data: customers, error } = await (supabase as any)
      .from("customers")
      .select("id, email, name, studio_access_until, created_at")
      .order("studio_access_until", { ascending: false, nullsFirst: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const now = new Date();
    const formatted = (customers || []).map((c: any) => {
      const accessUntil = c.studio_access_until ? new Date(c.studio_access_until) : null;
      const isActive = Boolean(accessUntil && accessUntil > now);
      let daysRemaining = 0;
      if (isActive && accessUntil) {
        daysRemaining = Math.max(1, Math.ceil((accessUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      }

      return {
        id: c.id,
        email: c.email,
        name: c.name || "Artista",
        studioAccessUntil: c.studio_access_until,
        isActive,
        daysRemaining,
        createdAt: c.created_at,
      };
    });

    return NextResponse.json({ customers: formatted }, { status: 200 });
  } catch (err: any) {
    console.error("[Admin Studio Passes GET Error]:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: Grant or revoke studio passes (3 days free, 30 days, or custom)
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.email || !ADMIN_EMAILS.includes(user.email.toLowerCase())) {
      return NextResponse.json({ error: "No autorizado. Solo los administradores pueden otorgar pases." }, { status: 403 });
    }

    const body = await req.json();
    const cleanEmail = (body.email || "").trim().toLowerCase();
    const days = parseInt(body.days, 10);
    const action = body.action || "grant"; // "grant" or "revoke"

    if (!cleanEmail) {
      return NextResponse.json({ error: "Por favor especifica el correo del usuario." }, { status: 400 });
    }

    const supabase = createAdminClient();

    // 1. Find or create customer
    let customerId: string;
    const { data: existingCustomer } = await (supabase as any)
      .from("customers")
      .select("id, studio_access_until")
      .eq("email", cleanEmail)
      .maybeSingle();

    if (existingCustomer) {
      customerId = existingCustomer.id;
    } else {
      const { data: newCustomer, error: createErr } = await (supabase as any)
        .from("customers")
        .insert({
          email: cleanEmail,
          name: body.name || cleanEmail.split("@")[0],
        })
        .select("id")
        .single();

      if (createErr || !newCustomer) {
        throw new Error(`Error creando cliente: ${createErr?.message}`);
      }
      customerId = newCustomer.id;
    }

    // 2. Perform action
    if (action === "revoke") {
      await (supabase as any)
        .from("customers")
        .update({ studio_access_until: null })
        .eq("id", customerId);

      return NextResponse.json({
        success: true,
        message: `Pase revocado exitosamente para ${cleanEmail}.`,
        studioAccessUntil: null,
      });
    }

    // Default: Grant pass (default 3 days if not specified)
    const validDays = isNaN(days) || days <= 0 ? 3 : days;
    const newExpiry = await grantStudioAccess(supabase, customerId, validDays);

    return NextResponse.json({
      success: true,
      message: `¡Pase de ${validDays} días otorgado exitosamente a ${cleanEmail}!`,
      daysGranted: validDays,
      studioAccessUntil: newExpiry,
    });
  } catch (err: any) {
    console.error("[Admin Studio Passes POST Error]:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
