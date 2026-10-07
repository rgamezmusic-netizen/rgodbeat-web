import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { isSiteAdmin } from "@/lib/auth/admin";
import { getStemRequestByTicketId } from "@/lib/stems/tickets";
import { ExpectedStemGroup, EXPECTED_STEM_GROUPS } from "@/lib/stems/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { getR2SignedDownloadUrl } from "@/lib/storage/r2";
import { getAuthorizedPurchase, guestPurchaseCookieName } from "@/lib/commerce/authorization";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ ticketId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { ticketId } = await params;
    const url = new URL(req.url);
    const groupKey = url.searchParams.get("group") as ExpectedStemGroup;

    if (!ticketId) {
      return NextResponse.json({ error: "ticketId is required" }, { status: 400 });
    }

    if (!groupKey || !EXPECTED_STEM_GROUPS.includes(groupKey)) {
      return NextResponse.json(
        { error: `Invalid stem group. Must be one of: ${EXPECTED_STEM_GROUPS.join(", ")}` },
        { status: 400 }
      );
    }

    // 1. Fetch ticket
    const ticket = await getStemRequestByTicketId(ticketId);
    if (!ticket) {
      return NextResponse.json({ error: "Stem ticket not found" }, { status: 404 });
    }

    // 2. Authentication and Authorization
    const user = await getCurrentUser();
    const isAdmin = isSiteAdmin(user);
    const isOwner = user?.email && ticket.customerEmail.toLowerCase() === user.email.toLowerCase();
    const authorizedPurchase = await getAuthorizedPurchase(createAdminClient(), ticket.purchaseId, {
      user,
      guestToken: orderId => req.cookies.get(guestPurchaseCookieName(orderId))?.value,
    });
    const hasGuestEntitlement = !user && authorizedPurchase?.customer_id === ticket.customerId;
    if (!isAdmin && !isOwner && !hasGuestEntitlement) {
      return NextResponse.json({ error: "No tienes acceso a estos stems." }, { status: 403 });
    }
    if (!authorizedPurchase || authorizedPurchase.customer_id !== ticket.customerId) {
      return NextResponse.json({ error: "No tienes acceso a estos stems." }, { status: 403 });
    }

    // 3. Status Check: Must be 'Delivered' (unless admin testing)
    if (ticket.status !== "Delivered" && !isAdmin) {
      return NextResponse.json(
        {
          error: `Stems are currently ${ticket.status}. They will become available for download once marked as Delivered by RGODBEAT.`,
        },
        { status: 403 }
      );
    }

    // 4. Resolve file from ticket's stemFiles
    const fileEntry = ticket.stemFiles?.[groupKey];

    if (fileEntry?.downloadUrl) {
      return NextResponse.redirect(fileEntry.downloadUrl);
    }

    const storagePath = fileEntry?.storagePath;
    if (storagePath) {
      if (storagePath.startsWith("r2:")) {
        const r2Key = storagePath.replace(/^r2:/, "");
        const signedUrl = await getR2SignedDownloadUrl(r2Key, 120);
        if (signedUrl) return NextResponse.redirect(signedUrl);
      } else {
        const supabase = createAdminClient();
        const { data: signed, error: signErr } = await supabase.storage
          .from("rgodbeat-private")
          .createSignedUrl(storagePath, 120);

        if (!signErr && signed?.signedUrl) {
          return NextResponse.redirect(signed.signedUrl);
        }
      }
    }

    return NextResponse.json({
      error: storagePath
        ? "No se pudo acceder al archivo de stems. Inténtalo de nuevo."
        : "El archivo de stems todavía no está disponible. Contacta con RGODBEAT.",
    }, { status: storagePath ? 503 : 409 });
  } catch (error: unknown) {
    console.error("[Stem Download Error]:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to download stem file" }, { status: 500 });
  }
}
