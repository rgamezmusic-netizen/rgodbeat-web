"use client";

import { useEffect, useState } from "react";
import { Check, ExternalLink, ShieldCheck } from "lucide-react";

const PROGRESS_KEY = "rgodbeat_park_rights_guide_v1";
const LEGACY_KEYS = ["rgodbeat_park_master_profile_v1", "rgodbeat_park_projects_v1"];

const STEPS = [
  {
    id: "youtube",
    number: "01",
    title: "YouTube y Content ID",
    explanation:
      "YouTube ofrece herramientas para administrar derechos. Content ID solo está disponible para titulares que cumplen los requisitos; normalmente se gestiona a través de un partner. Tener una cuenta de YouTube no activa Content ID automáticamente.",
    cost:
      "Las herramientas básicas de YouTube no tienen tarifa. El acceso a Content ID depende de la elegibilidad y el costo de un administrador externo, si lo usas.",
    url: "https://support.google.com/youtube/answer/9245819?hl=es",
    linkLabel: "Sitio oficial de YouTube",
  },
  {
    id: "copyright",
    number: "02",
    title: "U.S. Copyright Office",
    explanation:
      "Registra la composición y, cuando corresponda, la grabación sonora. Son derechos distintos. La solicitud y la titularidad deben coincidir con lo que realmente creaste y posees.",
    cost:
      "La tarifa publicada es $45 para una obra elegible de un solo autor y reclamante, y $65 para la solicitud estándar. La tarifa y elegibilidad dependen del tipo de solicitud.",
    url: "https://www.copyright.gov/registration/performing-arts/",
    linkLabel: "Sitio oficial de Copyright Office",
  },
  {
    id: "bmi",
    number: "03",
    title: "BMI",
    explanation:
      "Afíliate como compositor y registra tus obras para que BMI pueda identificar y recaudar las regalías de ejecución pública que administra. Usa los porcentajes y autores acordados.",
    cost:
      "BMI indica que la afiliación de compositores es gratuita. La afiliación de editoriales puede tener condiciones y costos distintos.",
    url: "https://www.bmi.com/creators",
    linkLabel: "Sitio oficial de BMI",
  },
  {
    id: "mlc",
    number: "04",
    title: "The MLC",
    explanation:
      "Si eres elegible y administras tus derechos mecánicos en Estados Unidos, únete y registra tus obras para que The MLC pueda asociarlas con regalías mecánicas de servicios digitales.",
    cost: "La afiliación y el registro de obras en The MLC son gratuitos.",
    url: "https://www.themlc.com/membership",
    linkLabel: "Sitio oficial de The MLC",
  },
  {
    id: "soundexchange",
    number: "05",
    title: "SoundExchange",
    explanation:
      "Regístrate en la categoría que corresponda a tu rol, por ejemplo artista destacado o titular de la grabación. SoundExchange administra regalías de ciertas transmisiones digitales no interactivas en Estados Unidos.",
    cost: "El registro en SoundExchange es gratuito.",
    url: "https://www.soundexchange.com/register/",
    linkLabel: "Sitio oficial de SoundExchange",
  },
  {
    id: "distribution",
    number: "06",
    title: "Distribución e ISRC",
    explanation:
      "Elige una distribuidora y entrega los metadatos, portada y audio final. Cada grabación necesita su ISRC; la distribuidora puede asignarlo según el servicio y el plan. El código identifica una grabación y no sustituye el registro de derechos de autor.",
    cost:
      "Symphonic publica Starter a $29.99 al año y Partner con tarifa personalizada. Si necesitas un prefijo propio en EE.UU., USISRC publica una tarifa única de $95; verifica si tu distribuidora ya asigna los códigos.",
    url: "https://symphonic.com/faq/",
    linkLabel: "Sitio oficial de distribución",
    secondaryUrl: "https://usisrc.org/guidance-support/",
    secondaryLabel: "Información oficial sobre prefijos ISRC",
  },
] as const;

type ProgressStepId = (typeof STEPS)[number]["id"];
type Progress = Record<ProgressStepId, boolean>;
const EMPTY_PROGRESS = Object.fromEntries(STEPS.map((step) => [step.id, false])) as Progress;

export function RightsRegistrationGuide() {
  const [progress, setProgress] = useState<Progress>(EMPTY_PROGRESS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    for (const key of LEGACY_KEYS) localStorage.removeItem(key);

    let restoredProgress = EMPTY_PROGRESS;
    try {
      const saved = localStorage.getItem(PROGRESS_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (parsed && typeof parsed === "object") {
          restoredProgress = Object.fromEntries(
            STEPS.map((step) => [step.id, (parsed as Record<string, unknown>)[step.id] === true]),
          ) as Progress;
        }
      }
    } catch {
      localStorage.removeItem(PROGRESS_KEY);
    }

    const frame = window.requestAnimationFrame(() => {
      setProgress(restoredProgress);
      setReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function toggleStep(id: ProgressStepId) {
    setProgress((current) => {
      const next = { ...current, [id]: !current[id] };
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
      return next;
    });
  }

  return (
    <main className="min-h-screen bg-[#07070a] px-4 py-10 text-white sm:px-6 sm:py-16">
      <div className="mx-auto max-w-3xl">
        <header className="mb-10 border-b border-white/10 pb-8 sm:mb-12">
          <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">
            <ShieldCheck aria-hidden="true" className="h-4 w-4" />
            The Park · Guía privada
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">
            Guía de registro de derechos musicales
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-300 sm:text-base">
            Sigue estos pasos para organizar los registros de una obra y su grabación. Los requisitos
            dependen de tu titularidad, elegibilidad y país.
          </p>
          <p className="mt-4 text-sm text-zinc-400" aria-live="polite">
            {ready
              ? `${Object.values(progress).filter(Boolean).length} de ${STEPS.length} pasos marcados`
              : "Cargando progreso guardado en este navegador…"}
          </p>
        </header>

        <ol className="divide-y divide-white/10">
          {STEPS.map((step) => {
            const checked = progress[step.id];
            return (
              <li key={step.id} className="py-7 first:pt-0 last:pb-0 sm:py-9">
                <div className="flex gap-4 sm:gap-6">
                  <span className="pt-1 font-mono text-sm text-cyan-300">{step.number}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                      <h2 className="text-xl font-semibold leading-snug sm:text-2xl">{step.title}</h2>
                      <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 text-sm text-zinc-300">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!ready}
                          onChange={() => toggleStep(step.id)}
                          className="peer sr-only"
                          aria-label={`Marcar ${step.title} como completado`}
                        />
                        <span className="flex h-5 w-5 items-center justify-center rounded border border-zinc-500 text-transparent transition peer-checked:border-cyan-300 peer-checked:bg-cyan-300 peer-checked:text-black peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-cyan-300">
                          <Check aria-hidden="true" className="h-3.5 w-3.5" />
                        </span>
                        {checked ? "Completado" : "Marcar paso"}
                      </label>
                    </div>
                    <p className="mt-3 text-sm leading-7 text-zinc-300">{step.explanation}</p>
                    <p className="mt-3 text-sm leading-7 text-zinc-400">
                      <span className="font-semibold text-zinc-200">Costo: </span>
                      {step.cost}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
                      <a
                        href={step.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-300 underline decoration-cyan-300/40 underline-offset-4 hover:text-cyan-200"
                      >
                        {step.linkLabel}
                        <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                      </a>
                      {"secondaryUrl" in step && (
                        <a
                          href={step.secondaryUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-zinc-400 underline decoration-zinc-500 underline-offset-4 hover:text-white"
                        >
                          {step.secondaryLabel}
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        <p className="mt-10 border-t border-white/10 pt-6 text-xs leading-6 text-zinc-500">
          El checklist se guarda únicamente en el almacenamiento local de este navegador. No se envía
          a RGodbeat ni a Supabase y no confirma que un registro legal haya sido aceptado.
        </p>
      </div>
    </main>
  );
}
