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

    // Deliver License Contract directly from database entitlement
    if (fileType === "contract") {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const supabase = createAdminClient();
      const { data: purchase } = await supabase
        .from("purchases")
        .select(`
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
      const cleanFilename = `${beatTitle.replace(/[^a-zA-Z0-9_-]/g, "_")}_${purchase.license_tier.toUpperCase()}_License.txt`;

      return new NextResponse(purchase.contract_text, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="${cleanFilename}"`,
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
