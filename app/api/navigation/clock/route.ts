export const dynamic = "force-dynamic";

// A prefetched season may be opened minutes later. Its clock must still use
// current server time, even when the device clock is incorrect.
export function GET() {
  return Response.json({ serverTime: new Date().toISOString() }, {
    headers: { "Cache-Control": "no-store" },
  });
}
