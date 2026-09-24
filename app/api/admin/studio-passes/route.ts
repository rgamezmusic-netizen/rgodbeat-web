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

// GET: List all registered users and customers with their studio access status
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.email || !ADMIN_EMAILS.includes(user.email.toLowerCase())) {
      return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    }

    const supabase = createAdminClient();

    // 1. Fetch registered users from Supabase Auth
    let authUsers: any[] = [];
    try {
      const { data: authData, error: authError } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      if (!authError && authData?.users) {
        authUsers = authData.users;
      }
    } catch (authErr) {
      console.warn("[Admin Studio Passes] Could not list auth users:", authErr);
    }

    // 2. Fetch customers table
    const { data: customers, error } = await (supabase as any)
      .from("customers")
      .select("id, email, name, studio_access_until, created_at");

    if (error && authUsers.length === 0) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const now = new Date();
    const customerMap = new Map<string, any>();
    (customers || []).forEach((c: any) => {
      if (c.email) {
        customerMap.set(c.email.toLowerCase().trim(), c);
      }
    });

    const combinedList: any[] = [];
    const processedEmails = new Set<string>();

    // Add all registered auth users first
    for (const u of authUsers) {
      if (!u.email) continue;
      const emailLower = u.email.toLowerCase().trim();
      processedEmails.add(emailLower);

      const cust = customerMap.get(emailLower);
      const accessUntil = cust?.studio_access_until ? new Date(cust.studio_access_until) : null;
      const isActive = Boolean(accessUntil && accessUntil > now);
      let daysRemaining = 0;
      if (isActive && accessUntil) {
        daysRemaining = Math.max(1, Math.ceil((accessUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      }

      combinedList.push({
        id: cust?.id || u.id,
        authId: u.id,
        email: u.email,
        name: cust?.name || u.user_metadata?.full_name || u.user_metadata?.name || u.email.split("@")[0] || "Artista",
        studioAccessUntil: cust?.studio_access_until || null,
        isActive,
        daysRemaining,
        isRegistered: true,
        createdAt: u.created_at || cust?.created_at,
        lastSignInAt: u.last_sign_in_at || null,
      });
    }

    // Add any remaining customers (e.g. guest checkouts not yet having auth.users)
    for (const c of (customers || [])) {
      if (!c.email) continue;
      const emailLower = c.email.toLowerCase().trim();
      if (processedEmails.has(emailLower)) continue;

      const accessUntil = c.studio_access_until ? new Date(c.studio_access_until) : null;
      const isActive = Boolean(accessUntil && accessUntil > now);
      let daysRemaining = 0;
      if (isActive && accessUntil) {
        daysRemaining = Math.max(1, Math.ceil((accessUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      }

      combinedList.push({
        id: c.id,
        authId: null,
        email: c.email,
        name: c.name || "Artista",
        studioAccessUntil: c.studio_access_until,
        isActive,
        daysRemaining,
        isRegistered: false,
        createdAt: c.created_at,
        lastSignInAt: null,
      });
    }

    // Sort by created_at descending (newest registrations first) so admin immediately sees new sign-ups!
    combinedList.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });

    return NextResponse.json({ customers: combinedList }, { status: 200 });
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
