import Link from "next/link";

export function StudioOptions() {
  return <section aria-label="Grabación y mix y master con The Park" className="space-y-4">
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.04] p-5 space-y-2">
        <p className="text-[10px] font-mono tracking-widest text-cyan-300 uppercase">Austin, Texas · Presencial</p>
        <h3 className="text-lg font-bold text-white">Graba en el estudio</h3>
        <p className="text-sm text-zinc-300 leading-relaxed">Si estás en Austin, puedes grabar tu proyecto en el estudio con RGODBEAT.</p>
        <a href="mailto:rgodbeat@gmail.com?subject=Grabaci%C3%B3n%20en%20Austin" className="inline-flex min-h-11 items-center text-sm font-semibold text-cyan-300 hover:text-white transition-colors">Consultar sesión en Austin →</a>
      </div>
      <div className="rounded-2xl border border-purple-400/20 bg-purple-400/[0.04] p-5 space-y-2">
        <p className="text-[10px] font-mono tracking-widest text-purple-300 uppercase">Fuera de Austin · A distancia</p>
        <h3 className="text-lg font-bold text-white">Trabajemos tu mix y master</h3>
        <p className="text-sm text-zinc-300 leading-relaxed">Si no estás en Austin, podemos trabajar la mezcla y el mastering de tu música a distancia.</p>
        <a href="mailto:rgodbeat@gmail.com?subject=Mix%20y%20master%20a%20distancia" className="inline-flex min-h-11 items-center text-sm font-semibold text-purple-300 hover:text-white transition-colors">Consultar mix y master →</a>
      </div>
    </div>
    <p className="text-sm text-zinc-400 leading-relaxed">Además de producir tu música, The Park te ayuda a organizar tus proyectos, derechos, registros y documentos para preparar cada lanzamiento. <Link href="/park" className="text-cyan-300 hover:text-white underline underline-offset-4">Abrir el centro de organización</Link>.</p>
  </section>;
}
