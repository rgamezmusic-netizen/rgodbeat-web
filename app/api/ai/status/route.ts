import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1200);

    const res = await fetch("http://127.0.0.1:8001/", {
      method: "GET",
      signal: controller.signal,
    }).catch(() => null);

    clearTimeout(timeoutId);

    if (res && (res.ok || res.status === 404 || res.status === 405)) {
      return NextResponse.json({
        running: true,
        host: "127.0.0.1",
        port: 8001,
        engine: "ACE-Step 1.5 (Apple Silicon M3 Pro MLX)",
      });
    }

    return NextResponse.json({
      running: false,
      message: "ACE-Step 1.5 no está corriendo en localhost:8001. Haz doble clic en INICIAR_ACE_IA.command en tu carpeta Paginas Web.",
    });
  } catch {
    return NextResponse.json({
      running: false,
    });
  }
}
