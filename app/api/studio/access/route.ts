import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user || !user.email) {
      return NextResponse.json({
        isDemo: true,
        isLoggedIn: false,
        hasActivePass: false,
        daysRemaining: 0,
        expiresAt: null,
        email: null,
      });
    }

    const supabase = createAdminClient();
    const { data: customer } = await (supabase as any)
      .from("customers")
      .select("id, email, name, studio_access_until")
      .eq("email", user.email)
      .maybeSingle();

    const ADMIN_EMAILS = [
      "admin@rgodbeat.com",
      "rgamezmusic@gmail.com",
      "rgodbeat@gmail.com",
    ];
    const isAdmin =
      user.user_metadata?.role === "admin" ||
      ADMIN_EMAILS.includes(user.email.toLowerCase());

    const accessUntil = customer?.studio_access_until ? new Date(customer.studio_access_until) : null;
    const now = new Date();
    const hasActivePass = isAdmin || Boolean(accessUntil && accessUntil > now);

    let daysRemaining = 0;
    if (isAdmin) {
      daysRemaining = 365;
    } else if (hasActivePass && accessUntil) {
      const diffMs = accessUntil.getTime() - now.getTime();
      daysRemaining = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    }

    return NextResponse.json({
      isDemo: !hasActivePass,
      isLoggedIn: true,
      hasActivePass,
      daysRemaining,
      expiresAt: customer?.studio_access_until || null,
      email: user.email,
      name: customer?.name || user.user_metadata?.full_name || "Artista",
    });
  } catch (err: any) {
    console.error("[Studio Access API Error]:", err);
    return NextResponse.json(
      { isDemo: true, isLoggedIn: false, hasActivePass: false, daysRemaining: 0, expiresAt: null, error: err.message },
      { status: 500 }
    );
  }
}
