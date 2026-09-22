import React from "react";
import { STUDIO_SERVICES } from "@/lib/mock-data";
import { ServiceInfo } from "@/types";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Button } from "@/components/ui/Button";

export function ServicesSection() {
  return (
    <section id="services" className="py-24 sm:py-32 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <SectionHeading
        tag="STUDIO SERVICES // PRODUCTION"
        title="Bespoke Studio Services"
        description="Whether you require an instrumental designed from scratch, analog-modeled mixing, or comprehensive artist direction, each service is delivered to label standards."
        action={
          <Button href="#contact" variant="outline" size="sm">
            INQUIRE CUSTOM PROJECT
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {STUDIO_SERVICES.map((service: ServiceInfo) => (
          <div
            key={service.id}
            className="group flex flex-col justify-between p-8 rounded-2xl bg-[#0f0f14] border border-white/[0.08] hover:border-purple-500/30 transition-all duration-300"
          >
            <div>
              <div className="flex items-center justify-between text-xs font-mono text-zinc-500 mb-4">
                <span className="uppercase tracking-wider">{service.category}</span>
                <span className="text-zinc-400">{service.turnaround}</span>
              </div>

              <div className="flex items-baseline justify-between mb-3">
                <h3 className="text-xl sm:text-2xl font-bold text-white group-hover:text-purple-200 transition-colors">
                  {service.title}
                </h3>
                <span className="text-sm font-mono font-semibold text-zinc-300">
                  {service.startingPrice}
                </span>
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

            <div className="mt-8 pt-4 border-t border-white/[0.06] flex items-center justify-between">
              <Button href="#contact" variant="ghost" size="sm" className="text-xs text-zinc-300 hover:text-white px-0">
                BOOK SESSION →
              </Button>
              <span className="text-[11px] font-mono text-zinc-500">24-Bit WAV Masters Included</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
