import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { createCommerceAdminClient } from "@/lib/commerce/admin-client";
import { hasVerifiedEmail, linkVerifiedCommerceCustomer } from "@/lib/commerce/authorization";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!hasVerifiedEmail(user)) return NextResponse.json({ gifts: [] }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const admin = createCommerceAdminClient();
  const linked = await linkVerifiedCommerceCustomer(admin, user);
  if (!linked) return NextResponse.json({ gifts: [], error: "No se pudo cargar el estado de tus regalos." }, { status: 409, headers: { "Cache-Control": "no-store" } });
  const { data, error } = await admin.rpc("rg_get_buyer_gifts", { p_user_id: user.id });
  if (error) return NextResponse.json({ gifts: [], error: "No se pudo cargar el estado de tus regalos." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ gifts: data || [] }, { headers: { "Cache-Control": "private, no-store" } });
}
