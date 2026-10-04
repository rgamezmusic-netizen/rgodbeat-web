import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedStudioExporter } from "@/lib/youtube/access";
import { clearYouTubeR2, putYouTubeR2, readYouTubeR2 } from "@/lib/youtube/storage";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHUNK_BYTES = 2_000_000;
const MAX_PARTS = 128;

function prefix(userId: string, id: string) { return `youtube/exports/${userId}/${id}/`; }
function imageType(bytes: Buffer): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export async function PUT(request: NextRequest) {
  const access = await getAuthorizedStudioExporter();
  if (!access.user) return NextResponse.json({ error: access.error }, { status: access.status });
  const id = request.nextUrl.searchParams.get("uploadId") || "";
  if (!UUID.test(id)) return NextResponse.json({ error: "Exportación inválida." }, { status: 400 });
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (!contentLength || contentLength > 4_000_000) return NextResponse.json({ error: "La imagen debe pesar menos de 4 MB." }, { status: 413 });
  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.length !== contentLength) return NextResponse.json({ error: "La imagen llegó incompleta." }, { status: 400 });
  const mime = imageType(bytes);
  if (!mime) return NextResponse.json({ error: "Usa una imagen JPG, PNG o WebP." }, { status: 415 });
  try {
    await putYouTubeR2(`${prefix(access.user.id, id)}cover`, bytes, mime);
    return NextResponse.json({ success: true, mime });
  } catch {
    return NextResponse.json({ error: "No se pudo guardar la imagen temporal en el bucket privado." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const access = await getAuthorizedStudioExporter();
  if (!access.user) return NextResponse.json({ error: access.error }, { status: access.status });
  const userId = access.user.id;
  const id = request.nextUrl.searchParams.get("uploadId") || "";
  const action = request.nextUrl.searchParams.get("action");
  if (!UUID.test(id)) return NextResponse.json({ error: "Exportación inválida." }, { status: 400 });
  const root = prefix(userId, id);

  try {
    if (action === "delete") {
      await clearYouTubeR2(root);
      return NextResponse.json({ success: true });
    }
    if (action !== "finish") {
      const index = Number(request.nextUrl.searchParams.get("index"));
      if (!Number.isInteger(index) || index < 0 || index >= MAX_PARTS) return NextResponse.json({ error: "Fragmento inválido." }, { status: 400 });
      const bytes = Buffer.from(await request.arrayBuffer());
      if (!bytes.length || bytes.length > CHUNK_BYTES) return NextResponse.json({ error: "Fragmento fuera del tamaño permitido." }, { status: 413 });
      await putYouTubeR2(`${root}pending/${index}`, bytes, "application/octet-stream");
      return NextResponse.json({ success: true });
    }

    const body = await request.json() as { parts?: number };
    if (!Number.isInteger(body.parts) || !body.parts || body.parts < 1 || body.parts > MAX_PARTS) {
      return NextResponse.json({ error: "Cantidad de fragmentos inválida." }, { status: 400 });
    }
    const target = `${root}master.wav`;
    const existing = await readYouTubeR2(target);
    if (existing?.length) return NextResponse.json({ success: true, key: target });
    const segments: Buffer[] = [];
    for (let start = 0; start < body.parts; start += 8) {
      const batch = await Promise.all(Array.from({ length: Math.min(8, body.parts - start) }, (_, offset) =>
        readYouTubeR2(`${root}pending/${start + offset}`)));
      for (const segment of batch) {
        if (!segment?.length || segment.length > CHUNK_BYTES) return NextResponse.json({ error: "Falta un fragmento. Conserva el proyecto y vuelve a exportar." }, { status: 409 });
        segments.push(segment);
      }
    }
    const audio = Buffer.concat(segments);
    if (audio.length < 44 || audio.toString("ascii", 0, 4) !== "RIFF" || audio.toString("ascii", 8, 12) !== "WAVE") {
      return NextResponse.json({ error: "El archivo no es un WAV válido." }, { status: 415 });
    }
    await putYouTubeR2(target, audio, "audio/wav");
    await clearYouTubeR2(`${root}pending/`);
    return NextResponse.json({ success: true, key: target });
  } catch (error) {
    console.error("[YouTube master staging]", error instanceof Error ? error.name : "Unknown error");
    return NextResponse.json({ error: "No se pudo preparar el export en R2. El proyecto local se conserva." }, { status: 503 });
  }
}
