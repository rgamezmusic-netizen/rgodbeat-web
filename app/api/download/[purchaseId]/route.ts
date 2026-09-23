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

    // Deliver License Contract: Resolves official PDF agreement if available, fallback to text certification
    if (fileType === "contract") {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const { resolveContractAsset } = await import("@/lib/commerce/contracts");
      const supabase = createAdminClient();
      const { data: purchase } = await supabase
        .from("purchases")
        .select(`
          beat_id,
          contract_text,
          license_tier,
          beats (
            title
          )
        `)
        .eq("id", purchaseId)
        .single();

      if (!purchase || !purchase.contract_text) {
        return NextResponse.json({ error: "License agreement not found for this purchase." }, { status: 404 });
      }

      const beatTitle = (purchase.beats as any)?.title || "RGODBEAT";
      const asset = await resolveContractAsset({
        beatId: purchase.beat_id,
        licenseTier: purchase.license_tier,
        beatTitle,
      });

      if (asset.hasPdf) {
        if (asset.sourceType === "r2" && asset.pdfUrl) {
          if (redirectMode) {
            return NextResponse.redirect(asset.pdfUrl, 302);
          }
          return NextResponse.json({ downloadUrl: asset.pdfUrl, fileName: asset.fileName });
        }

        if (asset.sourceType === "local" && asset.pdfPath) {
          const fs = await import("fs");
          const fileBuffer = fs.readFileSync(asset.pdfPath);
          return new NextResponse(fileBuffer, {
            status: 200,
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": `attachment; filename="${asset.fileName}"`,
            },
          });
        }
      }

      return new NextResponse(purchase.contract_text, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="${asset.fileName}"`,
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
