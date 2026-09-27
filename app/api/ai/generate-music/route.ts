import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    let prompt = "";
    let bpmStr = "";
    let keyStr = "";
    let instrumentalOnly = true;
    let musicFile: File | null = null;
    let vocalFile: File | null = null;

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      prompt = (formData.get("prompt") as string) || "";
      bpmStr = (formData.get("bpm") as string) || "";
      keyStr = (formData.get("key") as string) || "";
      instrumentalOnly = formData.get("instrumentalOnly") !== "false";
      musicFile = formData.get("musicReference") as File | null;
      vocalFile = formData.get("vocalReference") as File | null;
    } else {
      const body = await req.json();
      prompt = body.prompt || "";
      bpmStr = body.bpm ? String(body.bpm) : "";
      keyStr = body.key || "";
      instrumentalOnly = body.instrumentalOnly !== false;
    }

    if (!prompt.trim() && !musicFile && !vocalFile) {
      return NextResponse.json(
        { error: "Debes ingresar una idea de estilo o seleccionar un género." },
        { status: 400 }
      );
    }

    const finalBpm = bpmStr ? parseInt(bpmStr, 10) : 96;
    const finalKey = keyStr ? keyStr.trim() : "D minor";
    const title = prompt
      ? prompt.slice(0, 32).replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s]/g, "").trim()
      : (musicFile ? `Remix de ${musicFile.name.replace(/\.[^/.]+$/, "")}` : "AI Beat");

    // 1. Check if local ACE-Step-1.5 API server is running on localhost:8001
    let isLocalAceStepRunning = false;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);
      const res = await fetch("http://127.0.0.1:8001/", {
        method: "GET",
        signal: controller.signal,
      }).catch(() => null);
      clearTimeout(timeoutId);

      if (res && (res.ok || res.status === 404 || res.status === 405)) {
        isLocalAceStepRunning = true;
      }
    } catch {
      isLocalAceStepRunning = false;
    }

    // A) If Local ACE-Step is running on Mac M3 Pro:
    if (isLocalAceStepRunning) {
      console.log(`[AI Engine] Local ACE-Step detected. Dispatching task: ${prompt} (${finalBpm} BPM, ${finalKey})`);

      try {
        const aceRes = await fetch("http://127.0.0.1:8001/release_task", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: `${prompt || "urban beat"} ${finalBpm} BPM ${finalKey} ${instrumentalOnly ? "instrumental beat" : "with vocals"}`,
            make_instrumental: instrumentalOnly,
            bpm: finalBpm,
            key: finalKey,
          }),
        });

        if (aceRes.ok) {
          const aceData = await aceRes.json();
          const taskResultUrl = aceData.audio_url || `http://127.0.0.1:8001/v1/audio?path=${aceData.audio_path || ""}`;

          return NextResponse.json({
            success: true,
            title,
            bpm: finalBpm,
            key: finalKey,
            audioUrl: taskResultUrl,
            source: "ace_step_local_m3",
            instrumentalOnly,
          });
        }
      } catch (err: any) {
        console.error("[AI Engine] Error dispatching to local ACE-Step:", err);
      }
    }

    // B) If AceData Cloud is configured:
    const aceDataToken = process.env.ACEDATA_API_KEY || process.env.ACEDATA_TOKEN;
    if (aceDataToken) {
      try {
        const cloudRes = await fetch("https://api.acedata.cloud/suno/audios", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${aceDataToken}`,
          },
          body: JSON.stringify({
            action: "generate",
            prompt: `${prompt || "urban beat"} ${finalBpm} BPM ${finalKey}`,
            make_instrumental: instrumentalOnly,
            model: "chirp-v3-5",
          }),
        });

        if (cloudRes.ok) {
          const cloudData = await cloudRes.json();
          const audioUrl = cloudData.audio_url || cloudData.data?.[0]?.audio_url;
          if (audioUrl) {
            return NextResponse.json({
              success: true,
              title,
              bpm: finalBpm,
              key: finalKey,
              audioUrl,
              source: "ace_data_cloud",
              instrumentalOnly,
            });
          }
        }
      } catch (cloudErr) {
        console.warn("[AI Engine] AceData Cloud call failed:", cloudErr);
      }
    }

    // C) If neither is running:
    // Inform clearly with actionable instructions instead of returning a fake repeat
    return NextResponse.json(
      {
        error: "El motor local ACE-Step 1.5 está apagado en tu Mac. Por favor abre tu carpeta 'Paginas Web' y haz doble clic en 'INICIAR_ACE_IA.command'. Una vez que veas la luz verde en la pantalla, podrás generar todos los beats que quieras usando tu chip M3 Pro.",
        status: "engine_offline",
      },
      { status: 503 }
    );
  } catch (error: any) {
    console.error("[AI Generate Route Error]:", error);
    return NextResponse.json(
      { error: error.message || "Error procesando generación musical" },
      { status: 500 }
    );
  }
}
