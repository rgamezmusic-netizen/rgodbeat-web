import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/server";
import { isYouTubeChannelAdmin, youtubeConfig } from "@/lib/youtube/config";
import { getYouTubeChannelSettings } from "@/lib/youtube/channel";
import { isYouTubeFfmpegReady } from "@/lib/youtube/ffmpeg";
import { getYouTubeR2Bucket, isYouTubeR2Configured } from "@/lib/youtube/storage";
import R2ConnectionCheck from "./R2ConnectionCheck";

export const dynamic = "force-dynamic";

export default async function YouTubeSetupPage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  const user = await getCurrentUser();
  if (!isYouTubeChannelAdmin(user?.email)) return <section className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-[#101014] p-8 text-white"><h1 className="text-2xl font-bold">Acceso restringido</h1><p className="mt-3 text-zinc-400">Esta conexión está reservada para la cuenta propietaria del canal.</p></section>;
  const query = await searchParams;
  const config = youtubeConfig();
  let channel = null;
  let databaseReady = false;
  try {
    channel = await getYouTubeChannelSettings();
    databaseReady = true;
  } catch { /* Show the migration as pending until the private table is available. */ }
  const channelMatchesTarget = Boolean(channel && channel.channel_id === config.channelId);
  const setupChecks = [
    { label: "Google OAuth y clave de cifrado", ready: config.configured && config.validKey },
    { label: "Migración privada de Supabase", ready: databaseReady },
    { label: "Bucket temporal privado de R2", ready: isYouTubeR2Configured() && getYouTubeR2Bucket() === "rgodbeat-youtube-temp" },
    { label: "Conversor WAV a vídeo disponible", ready: isYouTubeFfmpegReady() },
    { label: "Canal RGODBEAT autorizado", ready: channelMatchesTarget },
  ];
  return <section className="mx-auto max-w-3xl space-y-6 text-white">
    <Link className="text-xs uppercase tracking-wider text-zinc-400 hover:text-white" href="/admin">← Administración</Link>
    <header><p className="text-xs font-mono uppercase tracking-[.22em] text-amber-400">RGODBEAT • PUBLICACIÓN</p><h1 className="mt-2 text-3xl font-bold">Canal de YouTube</h1><p className="mt-2 text-zinc-400">Un canal compartido, autorizado por la cuenta propietaria. Los artistas mantienen sus WAV originales.</p></header>
    {query.connected && <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">Canal conectado correctamente.</p>}
    {query.error && <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">Google no completó la conexión. Revisa las credenciales OAuth, la migración y vuelve a intentarlo.</p>}
    <div className="rounded-2xl border border-white/10 bg-[#101014] p-6 space-y-4">
      <div className="flex items-center justify-between gap-4"><div><h2 className="font-semibold">Cuenta del canal</h2><p className="mt-1 text-sm text-zinc-400">{channelMatchesTarget ? `${channel?.channel_title} • ${channel?.channel_id}` : channel ? `El canal guardado no coincide con el ID configurado: ${channel.channel_title} • ${channel.channel_id}` : "Todavía no está conectado"}</p></div><span className={`rounded-full px-3 py-1 text-xs ${channelMatchesTarget ? "bg-emerald-500/15 text-emerald-300" : "bg-zinc-700/60 text-zinc-300"}`}>{channelMatchesTarget ? "Conectado" : "Pendiente"}</span></div>
      <ul aria-label="Requisitos de publicación" className="grid gap-2 sm:grid-cols-2">
        {setupChecks.map((item) => <li key={item.label} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${item.ready ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-200" : "border-amber-500/20 bg-amber-500/5 text-amber-100"}`}>
          <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${item.ready ? "bg-emerald-400" : "bg-amber-400"}`} />{item.label}: {item.ready ? "Listo" : "Pendiente"}
        </li>)}
      </ul>
      {!config.configured || !config.validKey || !databaseReady ? <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-100">Hay requisitos pendientes. Sigue la guía <code>YOUTUBE_SETUP.md</code>; las credenciales se configuran en el servidor y la migración en Supabase.</p> : <a href="/api/admin/youtube/connect" className="inline-flex rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-black hover:bg-amber-300">{channelMatchesTarget ? "Volver a autorizar canal" : "Conectar canal RGODBEAT"}</a>}
    </div>
    <div className="rounded-2xl border border-white/10 bg-[#101014] p-6 space-y-2"><h2 className="font-semibold">Publicación desde el Studio</h2><p className="text-sm leading-6 text-zinc-400">El artista puede descargar el master y publicar una copia como vídeo MP4. Se usa la carátula del beat o una imagen JPG, PNG o WebP que el artista suba. El archivo temporal va a un bucket privado de R2 durante el proceso.</p><p className="text-sm leading-6 text-zinc-400">El Studio ofrece “No listado” como opción inicial, pregunta si el vídeo está dirigido a niños y pide confirmar derechos de audio e imagen antes de publicar. Los proyectos OAuth sin verificar pueden dejar las cargas privadas hasta completar la auditoría de YouTube.</p></div>
    <div className="rounded-2xl border border-white/10 bg-[#101014] p-6 space-y-3"><h2 className="font-semibold">Almacenamiento temporal</h2><p className="text-sm text-zinc-400">Prueba privada de escritura, lectura y borrado desde el servidor.</p><R2ConnectionCheck /></div>
  </section>;
}
