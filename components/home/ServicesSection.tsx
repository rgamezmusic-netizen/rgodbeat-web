import React from "react";
import Link from "next/link";
import { STUDIO_SERVICES, formatServicePrice, serviceInquiryMessage } from "@/lib/data/services";
import { ServiceInfo } from "@/types";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ContactButton } from "@/components/contact/ContactProvider";

export function ServicesSection() {
  return (
    <section id="services" className="py-24 sm:py-32 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <SectionHeading
        tag="SERVICIOS // PRODUCCIÓN Y SONIDO"
        title="Servicios para tu música"
        description="Producción, mix y master, desarrollo artístico y proyectos audiovisuales. Consulta el alcance de tu proyecto antes de contratar."
        action={
          <ContactButton subject="Consulta de servicios" variant="outline" size="sm">
            CONSULTAR MI PROYECTO
          </ContactButton>
        }
      />

      <div className="mb-8 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 sm:p-6 space-y-3 text-sm text-zinc-400 leading-relaxed">
        <p>Los precios se expresan en <strong className="text-zinc-200">USD</strong>. “Desde” indica una tarifa inicial por proyecto; desarrollo artístico corresponde a un programa mensual. El alcance, las revisiones, los derechos de uso y la fecha de entrega se confirman en la cotización.</p>
        <p>Si estás en <strong className="text-zinc-200">Austin</strong>, puedes consultar una sesión de grabación en el estudio. Si estás fuera, podemos trabajar tu <strong className="text-zinc-200">mix y master a distancia</strong>. <ContactButton subject="Grabación en Austin" variant="ghost" size="sm" className="px-0 text-cyan-300 underline underline-offset-4">Consultar grabación</ContactButton>.</p>
        <p>También puedes <Link href="/park" className="text-cyan-300 hover:text-white underline underline-offset-4">organizar tus proyectos en The Park</Link> y <Link href="/studio" className="text-amber-300 hover:text-white underline underline-offset-4">grabar en la app Studio</Link>.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {STUDIO_SERVICES.map((service: ServiceInfo) => (
          <article
            key={service.id}
            id={service.id}
            className="group flex flex-col justify-between p-8 rounded-2xl bg-[#0f0f14] border border-white/[0.08] hover:border-purple-500/30 transition-all duration-300"
          >
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-zinc-500 mb-4">
                <span className="uppercase tracking-wider">{service.category}</span>
                <span className="text-zinc-400">{service.billing === "project" ? "Plazo de referencia: " : ""}{service.turnaround}</span>
              </div>

              <div className="flex flex-col gap-2 mb-3">
                <h3 className="text-xl sm:text-2xl font-bold text-white group-hover:text-purple-200 transition-colors">
                  {service.title}
                </h3>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-mono">
                  {service.regularPrice && service.regularPrice > service.price && (
                    <del className="text-zinc-500" aria-label="Precio anterior">
                      {formatServicePrice({ ...service, price: service.regularPrice })}
                    </del>
                  )}
                  <span className={`font-semibold ${service.regularPrice && service.regularPrice > service.price ? "text-emerald-300" : "text-zinc-300"}`}>
                    {formatServicePrice(service)}
                  </span>
                  {service.regularPrice && service.regularPrice > service.price && (
                    <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold text-emerald-300">
                      AHORRA ${service.regularPrice - service.price} USD{service.billing === "monthly" ? " / MES" : ""}
                    </span>
                  )}
                </div>
              </div>

              <p className="text-sm text-zinc-400 font-normal leading-relaxed mb-6">
                {service.description}
              </p>

              <div className="space-y-2 pt-4 border-t border-white/[0.06]">
                {service.features.map((feat: string, idx: number) => (
                  <div key={idx} className="flex items-center gap-2.5 text-xs text-zinc-300">
                    <span className="w-1 h-1 rounded-full bg-purple-400" />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-3">
              <ContactButton subject={`Consulta: ${service.title}`} message={serviceInquiryMessage(service)} variant="ghost" size="sm" className="text-xs text-zinc-300 hover:text-white px-0 shrink-0">
                CONSULTAR SERVICIO →
              </ContactButton>
              <span className="text-[11px] text-right text-zinc-500">{service.delivery}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
