import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { createStemRequest, isTierEligibleForStems } from "@/lib/stems/tickets";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthorizedPurchase, guestPurchaseCookieName } from "@/lib/commerce/authorization";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    const body = await req.json();
    const { purchaseId } = body;

    if (!purchaseId) {
      return NextResponse.json({ error: "purchaseId is required" }, { status: 400 });
    }

    // Verify purchase exists and belongs to this user or customer email
    const supabase = createAdminClient();
    const purchase = await getAuthorizedPurchase(supabase, purchaseId, {
      user,
      guestToken: orderId => req.cookies.get(guestPurchaseCookieName(orderId))?.value,
    });
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
  } catch (error: unknown) {
    console.error("[Stem Request API Error]:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error creating stem request" },
      { status: 500 }
    );
  }
}
