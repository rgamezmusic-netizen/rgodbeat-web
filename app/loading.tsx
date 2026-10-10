import Link from 'next/link';

export default function Loading() {
  return <div className="min-h-screen bg-transparent text-white">
    <nav className="flex flex-wrap items-center gap-6 px-6 py-6 text-sm" aria-label="Navegación durante la carga">
      <Link href="/" className="font-bold">RGODBEAT</Link>
      <Link href="/ranking/season">TOP 23</Link>
      <Link href="/beats">BEATS</Link>
    </nav>
    <main className="mx-auto max-w-5xl px-6 pt-36 pb-20" aria-busy="true">
      <p className="text-sm text-zinc-400" role="status">Cargando sección…</p>
      <div className="mt-8 space-y-4" aria-hidden="true">
        <div className="h-16 w-2/3 rounded-xl bg-white/5" />
        <div className="h-32 rounded-xl bg-white/5" />
        <div className="h-32 rounded-xl bg-white/5" />
      </div>
    </main>
  </div>;
}
