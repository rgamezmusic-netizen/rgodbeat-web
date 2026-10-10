import React from "react";
import { ContactButton } from "@/components/contact/ContactProvider";
import { StudioOptions } from "@/components/park/StudioOptions";
import { ARTIST_DEVELOPMENT, formatServicePrice, serviceInquiryMessage } from "@/lib/data/services";

export function TheParkSection() {
  const service = ARTIST_DEVELOPMENT;
  return (
    <section id="the-park" className="relative py-24 sm:py-32 px-4 sm:px-6 lg:px-8 bg-[#0b0b0f]/60 backdrop-blur-md border-y border-white/[0.06] overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute -top-24 right-0 w-96 h-96 bg-purple-900/10 blur-[130px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          {/* Left Column: Editorial Presentation */}
          <div className="lg:col-span-7 space-y-6 sm:space-y-8">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
              <span className="text-[11px] font-mono tracking-[0.2em] text-purple-400 uppercase">
                DESARROLLO ARTÍSTICO // THE PARK
              </span>
            </div>

            <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white leading-tight">
              MÁS QUE UN ESTUDIO.
              <br />
              <span className="text-zinc-400 font-light">UN ECOSISTEMA ARTÍSTICO.</span>
            </h2>

            <p className="text-base sm:text-lg text-zinc-300 font-normal leading-relaxed">
              {service.description}
            </p>

            <StudioOptions />

            {/* Benefit Highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5">
                <div className="text-xs font-mono text-purple-300 flex items-center gap-1.5">
                  <span>01</span>
                  <span>/ CATÁLOGO PRIVADO</span>
                </div>
                <div className="text-sm font-semibold text-white">Bancos de sonido</div>
                <p className="text-xs text-zinc-400">Acceso a bibliotecas de samples, drum kits y stems de proyectos.</p>
              </div>

              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5">
                <div className="text-xs font-mono text-blue-300 flex items-center gap-1.5">
                  <span>02</span>
                  <span>/ ESTUDIO</span>
                </div>
                <div className="text-sm font-semibold text-white">Sesiones de producción</div>
                <p className="text-xs text-zinc-400">Grabación, mezcla y arreglos con sesiones coordinadas cada mes.</p>
              </div>

              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5">
                <div className="text-xs font-mono text-purple-300 flex items-center gap-1.5">
                  <span>03</span>
                  <span>/ FEEDBACK</span>
                </div>
                <div className="text-sm font-semibold text-white">Dirección creativa</div>
                <p className="text-xs text-zinc-400">Revisión de interpretación vocal, ritmo y arreglos.</p>
              </div>

              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5">
                <div className="text-xs font-mono text-blue-300 flex items-center gap-1.5">
                  <span>04</span>
                  <span>/ COMUNIDAD</span>
                </div>
                <div className="text-sm font-semibold text-white">Red de artistas</div>
                <p className="text-xs text-zinc-400">Comunidad en Discord para colaborar y preparar lanzamientos.</p>
              </div>
            </div>

            <div className="pt-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <ContactButton subject={`Consulta: ${service.title}`} message={serviceInquiryMessage(service)} variant="primary" size="md">
                CONSULTAR DESARROLLO ARTÍSTICO
              </ContactButton>
              <span className="text-xs text-zinc-500 font-mono">
                Presencial en Austin y a distancia
              </span>
            </div>
          </div>

          {/* Right Column: Visual Brand Card */}
          <div className="lg:col-span-5 min-w-0">
            <div className="relative rounded-2xl bg-[#14141a] border border-white/[0.08] p-6 sm:p-8 overflow-hidden shadow-2xl">
              <div className="absolute top-0 right-0 w-48 h-48 bg-purple-500/10 blur-3xl rounded-full pointer-events-none" />

              <div className="space-y-6">
                <div className="border-b border-white/[0.08] pb-4">
                  <span className="text-xs font-mono text-purple-300 uppercase">{service.category}</span>
                </div>

                <div className="space-y-2">
                  <h3 className="text-2xl font-bold text-white tracking-tight">{service.title}</h3>
                  <div className="text-xs text-zinc-400 font-normal">Austin, TX · Presencial y a distancia</div>
                  <div className="pt-3 space-y-1 font-mono">
                    <del className="block text-sm text-zinc-500" aria-label="Precio anterior">{formatServicePrice({ ...service, price: service.regularPrice! })}</del>
                    <p className="text-xl font-bold text-emerald-300">{formatServicePrice(service)}</p>
                    <p className="text-xs text-emerald-300">AHORRA ${service.regularPrice! - service.price} USD / MES</p>
                  </div>
                </div>

                <ul className="space-y-3 pt-2 text-xs text-zinc-300">
                  {service.features.map(feature => <li key={feature} className="flex items-start gap-2">
                    <span className="mt-1 w-1.5 h-1.5 shrink-0 rounded-full bg-purple-400" />
                    <span>{feature}</span>
                  </li>)}
                </ul>

                <div className="pt-6 border-t border-white/[0.08] space-y-3">
                  <p className="text-xs text-zinc-400">El alcance y las sesiones se confirman antes de contratar.</p>
                  <ContactButton subject={`Consulta: ${service.title}`} message={serviceInquiryMessage(service)} variant="outline" className="w-full">COMUNICARME →</ContactButton>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
