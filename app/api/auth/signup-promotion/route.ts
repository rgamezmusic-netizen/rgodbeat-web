import { NextResponse } from "next/server";
import { createCommerceAdminClient } from "@/lib/commerce/admin-client";

export const dynamic = "force-dynamic";

export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    const { data, error } = await createCommerceAdminClient().rpc("rg_signup_studio_campaign_status");
    const campaign = data?.[0];
    if (error || !campaign) throw new Error("Signup campaign unavailable");
    return NextResponse.json({
      active: campaign.active === true,
      endsAt: campaign.ends_at,
      serverTime: campaign.server_time,
    }, { headers });
  } catch {
    // Do not advertise an offer that the database cannot confirm is active.
    return NextResponse.json({ active: false }, { status: 503, headers });
  }
}
