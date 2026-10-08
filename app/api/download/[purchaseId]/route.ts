import { NextRequest, NextResponse } from "next/server";
import { resolvePrivateDownloadUrl } from "@/lib/storage/private";
import { getCurrentUser } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthorizedPurchase, guestPurchaseCookieName } from "@/lib/commerce/authorization";
import { resolveContractCustomerName } from '@/lib/commerce/contract-identity';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ purchaseId: string }> }
) {
  try {
    const { purchaseId } = await context.params;
    const { searchParams } = new URL(req.url);
    const requestedFileType = searchParams.get("fileType");
    const redirectMode = searchParams.get("redirect") !== "false";

    if (!purchaseId || typeof purchaseId !== "string") {
      return NextResponse.json({ error: "Missing or invalid purchase ID." }, { status: 400 });
    }

    const validTypes = ["mp3", "wav", "stems", "exclusive", "contract"] as const;
    if (!requestedFileType || !validTypes.includes(requestedFileType as typeof validTypes[number])) {
      return NextResponse.json(
        { error: `Invalid fileType. Allowed values: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }
    const fileType = requestedFileType as typeof validTypes[number];

    const supabase = createAdminClient();
    const purchase = await getAuthorizedPurchase(supabase, purchaseId, {
      user: await getCurrentUser(),
      guestToken: orderId => req.cookies.get(guestPurchaseCookieName(orderId))?.value,
    });
    if (!purchase) {
      return NextResponse.json({ error: "Inicia sesión con la cuenta titular o recupera el acceso seguro de la compra." }, { status: 403 });
    }

    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || undefined;
    const userAgent = req.headers.get("user-agent") || undefined;

    // Deliver Official License Agreement (Personalized Vector PDF generated on demand from Master Template)
    if (fileType === "contract") {
      const { extractLicenseMetadata, generateContractPdfBuffer, generateLicenseContract } = await import("@/lib/commerce/contracts");
      const { licenseId, contractVersion } = extractLicenseMetadata(purchase);
      const beatTitle = purchase.beats?.title || "RGODBEAT";
      const cleanTitle = beatTitle.replace(/[^a-zA-Z0-9_-]/g, "_");
      const order = purchase.orders;
      const purchaser = order.customers;
      const licensee = purchase.customers;
      const { data: contractItem } = await supabase.from("order_items").select("unit_price")
        .eq("id", purchase.order_item_id).maybeSingle();
      const tierUpper = String(purchase.license_tier || "WAV").toUpperCase();

      const format = searchParams.get("format") || "pdf";
      const [customerName, purchaserName] = await Promise.all([
        resolveContractCustomerName(supabase, { authUserId: licensee?.auth_user_id, email: licensee?.email || '', fallbackName: licensee?.name }),
        resolveContractCustomerName(supabase, { authUserId: purchaser?.auth_user_id, email: purchaser?.email || '', fallbackName: purchaser?.name }),
      ]);
      const contractParams = {
        orderId: purchase.order_id, customerName, customerEmail: licensee?.email || '', purchaserName,
        isGift: purchase.customer_id !== order.customer_id, beatTitle, beatId: purchase.beat_id,
        licenseTier: purchase.license_tier, amountPaid: Number(contractItem?.unit_price ?? order.total_amount) || 0,
        currency: order.currency || 'USD', purchaseDate: purchase.created_at, licenseId, version: contractVersion,
      };

      // Plaintext certificate fallback if explicitly requested (?format=txt)
      if (format === "txt") {
        return new NextResponse(generateLicenseContract(contractParams), {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Content-Disposition": `attachment; filename="${cleanTitle}_${tierUpper}_License_${licenseId}.txt"`,
            "Cache-Control": "private, no-store",
          },
        });
      }

      // Generate official personalized vector PDF dynamically
      const pdfBytes = await generateContractPdfBuffer(contractParams);

      return new NextResponse(Buffer.from(pdfBytes), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${cleanTitle}_${tierUpper}_License_${licenseId}.pdf"`,
          "Cache-Control": "private, no-store",
        },
      });
    }

    const result = await resolvePrivateDownloadUrl({
      purchaseId,
      fileType,
      expiresInSeconds: 60,
      ipAddress,
      userAgent,
    });

    if (redirectMode) {
      return NextResponse.redirect(result.downloadUrl, 302);
    }

    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to resolve download link.";
    const status = message.includes("Violation") || message.includes("denied") ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
