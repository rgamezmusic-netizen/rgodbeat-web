import { NextRequest, NextResponse } from "next/server";
import { resolvePrivateDownloadUrl } from "@/lib/storage/private";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ purchaseId: string }> }
) {
  try {
    const { purchaseId } = await context.params;
    const { searchParams } = new URL(req.url);
    const fileType = searchParams.get("fileType") as any;
    const redirectMode = searchParams.get("redirect") !== "false";

    if (!purchaseId || typeof purchaseId !== "string") {
      return NextResponse.json({ error: "Missing or invalid purchase ID." }, { status: 400 });
    }

    const validTypes = ["mp3", "wav", "stems", "exclusive", "contract"];
    if (!fileType || !validTypes.includes(fileType)) {
      return NextResponse.json(
        { error: `Invalid fileType. Allowed values: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || undefined;
    const userAgent = req.headers.get("user-agent") || undefined;

    // Deliver Official License Agreement (Personalized Vector PDF generated on demand from Master Template)
    if (fileType === "contract") {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const { extractLicenseMetadata, generateContractPdfBuffer } = await import("@/lib/commerce/contracts");
      const supabase = createAdminClient();

      const { data: purchase, error: pError } = await supabase
        .from("purchases")
        .select(`
          id,
          order_id,
          beat_id,
          license_tier,
          contract_text,
          created_at,
          beats (
            title
          ),
          orders (
            total_amount,
            currency,
            customers (
              name,
              email
            )
          )
        `)
        .eq("id", purchaseId)
        .single();

      if (pError || !purchase) {
        return NextResponse.json({ error: "License agreement not found for this purchase." }, { status: 404 });
      }

      const { licenseId, contractVersion } = extractLicenseMetadata(purchase);
      const beatTitle = (purchase.beats as any)?.title || "RGODBEAT";
      const cleanTitle = beatTitle.replace(/[^a-zA-Z0-9_-]/g, "_");
      const order = purchase.orders as any;
      const customer = order?.customers as any;
      const tierUpper = String(purchase.license_tier || "WAV").toUpperCase();

      const format = searchParams.get("format") || "pdf";

      // Plaintext certificate fallback if explicitly requested (?format=txt)
      if (format === "txt" && purchase.contract_text) {
        return new NextResponse(purchase.contract_text, {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Content-Disposition": `attachment; filename="${cleanTitle}_${tierUpper}_License_${licenseId}.txt"`,
          },
        });
      }

      // Generate official personalized vector PDF dynamically
      const pdfBytes = await generateContractPdfBuffer({
        orderId: purchase.order_id,
        customerName: customer?.name || "Customer",
        customerEmail: customer?.email || "",
        beatTitle,
        beatId: purchase.beat_id,
        licenseTier: purchase.license_tier,
        amountPaid: Number(order?.total_amount) || 0,
        currency: order?.currency || "USD",
        purchaseDate: purchase.created_at,
        licenseId,
        version: contractVersion,
      });

      return new NextResponse(Buffer.from(pdfBytes), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${cleanTitle}_${tierUpper}_License_${licenseId}.pdf"`,
          "Cache-Control": "private, max-age=3600",
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
  } catch (err: any) {
    const message = err.message || "Failed to resolve download link.";
    const status = message.includes("Violation") || message.includes("denied") ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
