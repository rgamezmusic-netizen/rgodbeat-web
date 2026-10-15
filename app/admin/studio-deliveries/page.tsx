import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { requireAdminAuth } from '@/lib/auth/server';
import { DELIVERY_UUID } from '@/lib/studio/deliveries/model';
import { listDeliveries, readDelivery } from '@/lib/studio/deliveries/storage';
import { deliveryEmailConfigured, deliveryRecipient, notifyDelivery } from '@/lib/studio/deliveries/notification';

export const dynamic = 'force-dynamic';
async function retryEmail(id: string) {
  'use server';
  await requireAdminAuth('/admin/studio-deliveries');
  if (!DELIVERY_UUID.test(id)) return;
  await notifyDelivery(id);
  revalidatePath('/admin/studio-deliveries');
}
export default async function StudioDeliveriesPage({ searchParams }: { searchParams: Promise<{ cursor?: string; delivery?: string }> }) {
  await requireAdminAuth('/admin/studio-deliveries');
  const query = await searchParams;
  let result: Awaited<ReturnType<typeof listDeliveries>> = { deliveries: [] }, error = '';
  try {
    if (query.delivery) {
      const stored = DELIVERY_UUID.test(query.delivery) ? await readDelivery(query.delivery) : null;
      if (!stored?.delivery.receivedAt) error = 'No se encontró esa entrega recibida.';
      else result.deliveries = [stored.delivery];
    } else result = await listDeliveries(query.cursor && query.cursor.length < 2048 ? query.cursor : undefined);
  } catch { error = 'No se pudo consultar el almacenamiento de entregas. Intenta actualizar la página.'; }
  const emailReady = deliveryEmailConfigured();
  return <div className="space-y-6">
    <div className="space-y-2"><h1 className="text-2xl font-bold text-white">Voces recibidas del Studio</h1>
      <p className="text-sm text-zinc-400">Entregas privadas de los artistas, con voces RAW, tono, escala y tempo del proyecto.</p>
      <p className="text-xs text-zinc-400">Avisos a {deliveryRecipient()}: {emailReady ? 'correo configurado' : 'pendientes de configurar el correo; las entregas se conservan aquí'}.</p>
      <div className="flex gap-4 text-xs text-amber-300"><Link href="/admin/studio-deliveries">Ver últimas entregas</Link><a href={query.delivery ? `/admin/studio-deliveries?delivery=${encodeURIComponent(query.delivery)}` : '/admin/studio-deliveries'}>Actualizar bandeja</a></div>
    </div>
    {error && <p role="alert" className="rounded-lg border border-red-500/30 p-4 text-sm text-red-200">{error}</p>}
    {!error && !result.deliveries.length && <p className="rounded-xl border border-zinc-800 p-6 text-sm text-zinc-400">Todavía no hay entregas en esta página de la bandeja.</p>}
    {result.deliveries.map(delivery => {
      const root = `/api/admin/studio-deliveries/${delivery.id}/download?file=`;
      return <article key={delivery.id} className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-white">{delivery.artistName} — {delivery.title}</h2>
          <p className="mt-1 text-xs text-zinc-400">{delivery.contactEmail} · {new Date(delivery.receivedAt!).toLocaleString('es', { timeZone: 'America/Chicago' })} (Chicago)</p></div>
          <span className="rounded-full border border-emerald-500/30 px-3 py-1 text-xs text-emerald-200">Recibida · {delivery.files.length} pistas</span></div>
        <div className="grid gap-2 text-sm sm:grid-cols-4"><p><span className="text-zinc-400">Tempo: </span>{delivery.project.bpm} BPM</p>
          <p><span className="text-zinc-400">Tono: </span>{delivery.project.key}</p><p><span className="text-zinc-400">Escala: </span>{delivery.project.scale}</p>
          <p><span className="text-zinc-400">Duración: </span>{delivery.project.durationSeconds.toFixed(2)} s</p></div>
        <p className="text-xs text-zinc-400">Beat: {delivery.project.beatTitle}. Todas las pistas empiezan en 0:00. El tono y el tempo corresponden a los valores configurados por el artista.</p>
        {delivery.message && <p className="whitespace-pre-wrap rounded-lg bg-black/30 p-3 text-sm text-zinc-300">{delivery.message}</p>}
        <div className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
          {delivery.files.map(file => <div key={file.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 text-xs">
            <div><p className="font-semibold text-zinc-200">{file.name}</p><p className="mt-1 text-zinc-400">{file.sampleRate / 1000} kHz · 32-bit float · {file.channels === 1 ? 'Mono' : 'Estéreo'} · {(file.bytes / 1_000_000).toFixed(1)} MB</p>
              <p className="mt-1 text-zinc-500">Afinación de la pista: {file.tuning.rootKey} / {file.tuning.scaleMode} (sin aplicar al RAW)</p></div>
            <a href={`${root}${file.id}`} className="rounded-lg bg-amber-500 px-3 py-2 font-bold text-black hover:bg-amber-400">Descargar WAV</a>
          </div>)}
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-amber-300"><a href={`${root}info`}>Descargar ficha del proyecto (.txt)</a><a href={`${root}metadata`}>Descargar datos completos (.json)</a></div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 pt-3 text-xs text-zinc-400">
          <span className="break-all">Comprobante: {delivery.id}</span><span>{delivery.notification === 'sent' ? 'Aviso por correo enviado' : `Aviso por correo pendiente${delivery.notificationError ? ` (${delivery.notificationError})` : ''}`}</span>
          {delivery.notification !== 'sent' && <form action={retryEmail.bind(null, delivery.id)}><button disabled={!emailReady} className="rounded-lg border border-zinc-700 px-3 py-2 text-zinc-200 disabled:opacity-40">Reintentar aviso por correo</button></form>}
        </div>
      </article>;
    })}
    {result.cursor && <Link href={`/admin/studio-deliveries?cursor=${encodeURIComponent(result.cursor)}`} className="inline-block rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200">Ver entregas anteriores →</Link>}
  </div>;
}
