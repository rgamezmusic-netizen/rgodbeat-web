import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth/server";
import {
  updateStemRequestStatus,
  attachStemFile,
  getStemRequestByTicketId,
  listAllStemRequests,
} from "@/lib/stems/tickets";
import { StemTicketStatus, STEM_TICKET_STATUSES, ExpectedStemGroup, EXPECTED_STEM_GROUPS } from "@/lib/stems/types";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdminAuth("/admin/stem-requests");
    const tickets = await listAllStemRequests();
    return NextResponse.json({ tickets });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdminAuth("/admin/stem-requests");
    const body = await req.json();
    const { ticketId, status, adminNotes } = body;

    if (!ticketId) {
      return NextResponse.json({ error: "ticketId is required" }, { status: 400 });
    }

    if (status && !STEM_TICKET_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${STEM_TICKET_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    const updated = await updateStemRequestStatus(ticketId, status, adminNotes);
    return NextResponse.json({ success: true, ticket: updated });
  } catch (error: any) {
    console.error("[Admin Stem Update Error]:", error);
    return NextResponse.json({ error: error?.message || "Failed to update ticket" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminAuth("/admin/stem-requests");
    const formData = await req.formData();
    const ticketId = formData.get("ticketId") as string;
    const groupKey = formData.get("groupKey") as ExpectedStemGroup;
    const downloadUrl = (formData.get("downloadUrl") as string) || undefined;
    const file = formData.get("file") as File | null;

    if (!ticketId || !groupKey) {
      return NextResponse.json({ error: "ticketId and groupKey are required" }, { status: 400 });
    }

    if (!EXPECTED_STEM_GROUPS.includes(groupKey)) {
      return NextResponse.json(
        { error: `Invalid groupKey: ${groupKey}. Must be one of: ${EXPECTED_STEM_GROUPS.join(", ")}` },
        { status: 400 }
      );
    }

    let storagePath = `stems/${ticketId}/${groupKey}.wav`;
    let sizeBytes = 0;

    if (file && typeof file === "object" && "arrayBuffer" in file) {
      const buffer = Buffer.from(await file.arrayBuffer());
      sizeBytes = buffer.length;

      // Try uploading to Supabase storage bucket rgodbeat-private
      try {
        const supabase = createAdminClient();
        await supabase.storage
          .from("rgodbeat-private")
          .upload(storagePath, buffer, {
            contentType: "audio/wav",
            upsert: true,
          });
      } catch (uploadErr) {
        console.warn("[Admin Stem Storage Upload Warning]:", uploadErr);
      }
    }

    const updated = await attachStemFile(ticketId, groupKey, {
      fileName: `${groupKey}.wav`,
      storagePath,
      downloadUrl,
      sizeBytes: sizeBytes || undefined,
      uploadedAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, ticket: updated });
  } catch (error: any) {
    console.error("[Admin Stem File Upload Error]:", error);
    return NextResponse.json({ error: error?.message || "Failed to attach stem file" }, { status: 500 });
  }
}
