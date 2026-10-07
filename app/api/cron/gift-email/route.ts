import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createCommerceAdminClient } from "@/lib/commerce/admin-client";
import { processNextGiftEmail, ResendTransactionalEmailProvider } from "@/lib/commerce/email";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_LIMIT = 10;

function hasValidCronAuthorization(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || !authorization) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(authorization);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function GET(request: NextRequest) {
  if (!hasValidCronAuthorization(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    return NextResponse.json({ error: "Transactional email is not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const supabase = createCommerceAdminClient();
    const provider = new ResendTransactionalEmailProvider();
    const counts = { sent: 0, retry: 0, failed: 0 };
    for (let processed = 0; processed < BATCH_LIMIT; processed++) {
      const result = await processNextGiftEmail(supabase, provider);
      if (result.status === "empty") break;
      if (result.status === "sent") counts.sent++;
      else if (result.status === "retry") counts.retry++;
      else counts.failed++;
    }
    return NextResponse.json({ success: true, ...counts }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Transactional email worker could not complete." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
