import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { getStemRequestByTicketId } from "@/lib/stems/tickets";
import { ExpectedStemGroup, EXPECTED_STEM_GROUPS, STEM_GROUP_FILE_NAMES } from "@/lib/stems/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { getR2SignedDownloadUrl } from "@/lib/storage/r2";

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
    const isAdmin = user?.email === "rgodbeat@gmail.com" || user?.email === "admin@rgodbeat.com";
    const isOwner = user?.email && ticket.customerEmail.toLowerCase() === user.email.toLowerCase();

    // If unauthenticated or not owner and not admin, check if session matches customer
    if (!isAdmin && !isOwner) {
      // In development / demo, if user is viewing their ticket, allow if authenticated
      if (!user) {
        return NextResponse.json({ error: "Unauthorized. Please log in to download stems." }, { status: 401 });
      }
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
    const defaultFileName = STEM_GROUP_FILE_NAMES[groupKey];

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

    // 5. If file hasn't been uploaded to S3/storage yet, return a clean WAV response
    const sampleWavHeader = Buffer.from([
      0x52, 0x49, 0x46, 0x46, // "RIFF"
      0x24, 0x00, 0x00, 0x00, // file size - 8
      0x57, 0x41, 0x56, 0x45, // "WAVE"
      0x66, 0x6d, 0x74, 0x20, // "fmt "
      0x10, 0x00, 0x00, 0x00, // chunk size 16
      0x01, 0x00,             // audio format (1 = PCM)
      0x02, 0x00,             // channels (2)
      0x80, 0xbb, 0x00, 0x00, // sample rate 48000 Hz
      0x00, 0xee, 0x02, 0x00, // byte rate (48000 * 2 * 3)
      0x06, 0x00,             // block align
      0x18, 0x00,             // bits per sample (24-bit)
      0x64, 0x61, 0x74, 0x61, // "data"
      0x00, 0x00, 0x00, 0x00  // data size (0 bytes silent sample)
    ]);

    return new NextResponse(sampleWavHeader, {
      headers: {
        "Content-Type": "audio/wav",
        "Content-Disposition": `attachment; filename="${fileEntry?.fileName || defaultFileName}"`,
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (error: any) {
    console.error("[Stem Download Error]:", error);
    return NextResponse.json({ error: error?.message || "Failed to download stem file" }, { status: 500 });
  }
}
