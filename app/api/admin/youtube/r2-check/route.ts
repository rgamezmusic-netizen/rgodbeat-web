import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { isYouTubeChannelAdmin } from "@/lib/youtube/config";
import { getYouTubeR2Bucket, isYouTubeR2Configured, verifyYouTubeR2Connection } from "@/lib/youtube/storage";

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getCurrentUser();
  if (!isYouTubeChannelAdmin(user?.email)) {
    return NextResponse.json({ success: false, error: "No autorizado." }, { status: 403 });
  }

  if (!isYouTubeR2Configured() || getYouTubeR2Bucket() !== "rgodbeat-youtube-temp") {
    return NextResponse.json({ success: false, error: "Revisa las variables privadas de R2 en Vercel." }, { status: 503 });
  }

  try {
    await verifyYouTubeR2Connection();
    return NextResponse.json({ success: true, message: "R2 conectado. Escritura, lectura y limpieza verificadas." });
  } catch {
    return NextResponse.json({ success: false, error: "El servidor no pudo completar la prueba de R2. Revisa el ID de cuenta, el bucket y los permisos de la clave S3." }, { status: 503 });
  }
}
