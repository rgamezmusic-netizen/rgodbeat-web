import Link from "next/link";
import { ContactButton } from "@/components/contact/ContactProvider";
import { STUDIO_SERVICES, serviceInquiryMessage } from "@/lib/data/services";

export function StudioOptions() {
  return <section aria-label="Grabación y mix y master con The Park" className="space-y-4">
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.04] p-5 space-y-2">
        <p className="text-[10px] font-mono tracking-widest text-cyan-300 uppercase">Austin, Texas · Presencial</p>
        <h3 className="text-lg font-bold text-white">Graba en el estudio</h3>
        <p className="text-sm text-zinc-300 leading-relaxed">Si estás en Austin, puedes grabar tu proyecto en el estudio con RGODBEAT.</p>
        <ContactButton subject="Grabación en Austin" variant="ghost" className="min-h-11 px-0! text-left text-sm font-semibold text-cyan-300!">Consultar sesión en Austin →</ContactButton>
      </div>
      <div className="rounded-2xl border border-purple-400/20 bg-purple-400/[0.04] p-5 space-y-2">
        <p className="text-[10px] font-mono tracking-widest text-purple-300 uppercase">Fuera de Austin · A distancia</p>
        <h3 className="text-lg font-bold text-white">Trabajemos tu mix y master</h3>
        <p className="text-sm text-zinc-300 leading-relaxed">Si no estás en Austin, podemos trabajar la mezcla y el mastering de tu música a distancia.</p>
        <ContactButton subject="Mix y master a distancia" message={serviceInquiryMessage(STUDIO_SERVICES.find(service => service.id === "mixing-mastering")!)} variant="ghost" className="min-h-11 px-0! text-left text-sm font-semibold text-purple-300!">Consultar mix y master →</ContactButton>
      </div>
    </div>
    <p className="text-sm text-zinc-400 leading-relaxed">The Park ofrece una guía privada con pasos para registrar derechos musicales. El avance del checklist se guarda solo en este navegador. <Link href="/park" className="text-cyan-300 hover:text-white underline underline-offset-4">Abrir la guía privada</Link>.</p>
  </section>;
}
