import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { createStemRequest, getStemRequestByPurchase, isTierEligibleForStems } from "@/lib/stems/tickets";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthorizedPurchase } from "@/lib/commerce/authorization";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    const body = await req.json();
    const { purchaseId } = body;

    if (!purchaseId) {
      return NextResponse.json({ error: "purchaseId is required" }, { status: 400 });
    }

    // Verify purchase exists and belongs to this user or customer email
    const supabase = createAdminClient();
    const purchase = await getAuthorizedPurchase(supabase, purchaseId, { user });
    if (!purchase) {
      return NextResponse.json({ error: "Access denied. Purchase belongs to another account." }, { status: 403 });
    }

    // Eligibility check: UNLIMITED or EXCLUSIVE only
    const tier = (purchase.license_tier || "").toLowerCase();
    if (!isTierEligibleForStems(tier)) {
      return NextResponse.json(
        {
          error: `Ineligible Tier: Stem requests are exclusively available for UNLIMITED and EXCLUSIVE licenses. Your purchased tier (${tier.toUpperCase()}) does not include stems.`,
        },
        { status: 403 }
      );
    }

    // Create or retrieve existing ticket
    const ticket = await createStemRequest(purchaseId);

    return NextResponse.json({
      success: true,
      ticket,
    });
  } catch (error: any) {
    console.error("[Stem Request API Error]:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error creating stem request" },
      { status: 500 }
    );
  }
}
