"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, ExternalLink, ShieldCheck } from "lucide-react";

const PROGRESS_KEY = "rgodbeat_park_rights_guide_v1";
const CHECKLISTS_KEY = "rgodbeat_park_song_checklists_v2";

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
type SongChecklist = { id: string; name: string; progress: Progress };

function readChecklists(saved: string): SongChecklist[] {
  const parsed: unknown = JSON.parse(saved);
  if (!Array.isArray(parsed)) throw new Error("Invalid checklist list");
  const ids = new Set<string>();
  return parsed.map((song: unknown) => {
    if (!song || typeof song !== "object") throw new Error("Invalid checklist");
    const { id, name, progress } = song as Record<string, unknown>;
    if (typeof id !== "string" || !id || ids.has(id) || typeof name !== "string" || !name.trim()
      || !progress || typeof progress !== "object"
      || STEPS.some((step) => typeof (progress as Record<string, unknown>)[step.id] !== "boolean")) {
      throw new Error("Invalid checklist");
    }
    ids.add(id);
    return { id, name, progress: Object.fromEntries(STEPS.map((step) => [
      step.id, (progress as Record<string, unknown>)[step.id],
    ])) as Progress };
  });
}

export function RightsRegistrationGuide() {
  const [songs, setSongs] = useState<SongChecklist[]>([]);
  const [ready, setReady] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [storageMessage, setStorageMessage] = useState("");
  const [unsaved, setUnsaved] = useState(false);

  useEffect(() => {
    let restoredSongs: SongChecklist[] = [];
    let message = "";
    let canEdit = true;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(CHECKLISTS_KEY);
      if (saved !== null) {
        restoredSongs = readChecklists(saved);
      } else {
        const legacy = localStorage.getItem(PROGRESS_KEY);
        if (legacy) {
          const parsed: unknown = JSON.parse(legacy);
          if (parsed && typeof parsed === "object") {
            const progress = Object.fromEntries(STEPS.map((step) => [
              step.id, (parsed as Record<string, unknown>)[step.id] === true,
            ])) as Progress;
            if (Object.values(progress).some(Boolean)) {
              restoredSongs = [{ id: "legacy-progress", name: "Checklist anterior", progress }];
              message = "Conservamos tus marcas anteriores. Usa Editar nombre para indicar a qué tema pertenecen.";
            }
          }
        }
      }
    } catch (error) {
      // Never overwrite unreadable saved data with an empty list.
      const unavailable = error instanceof DOMException
        && (error.name === "SecurityError" || error.name === "QuotaExceededError");
      canEdit = unavailable;
      message = unavailable
        ? "El navegador no permite guardar el checklist. Los cambios solo durarán mientras esta página siga abierta."
        : "No se pudo leer el checklist guardado. No hemos borrado ni sobrescrito tus datos.";
    }

    const frame = window.requestAnimationFrame(() => {
      setSongs(restoredSongs);
      setStorageMessage(message);
      setReady(canEdit);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function saveSongs(next: SongChecklist[]) {
    setSongs(next);
    try {
      localStorage.setItem(CHECKLISTS_KEY, JSON.stringify(next));
      setUnsaved(false);
      setStorageMessage("Cambios guardados en este navegador.");
    } catch {
      setUnsaved(true);
      setStorageMessage("No se pudieron guardar los cambios. No cierres esta página si quieres conservarlos; permite el almacenamiento o libera espacio y vuelve a intentarlo.");
    }
  }

  function toggleStep(songId: string, stepId: ProgressStepId) {
    saveSongs(songs.map((song) => song.id === songId
      ? { ...song, progress: { ...song.progress, [stepId]: !song.progress[stepId] } }
      : song));
  }

  function removeSong(song: SongChecklist) {
    if (!window.confirm(`¿Eliminar el checklist de «${song.name}» y sus marcas?`)) return;
    saveSongs(songs.filter((current) => current.id !== song.id));
    if (editingId === song.id) setEditingId(null);
  }

  return (
    <main className="min-h-screen bg-[#07070a] px-4 py-10 text-white sm:px-6 sm:py-16">
      <div className="mx-auto max-w-3xl">
        <header className="mb-10 border-b border-white/10 pb-8 sm:mb-12">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">
              <ShieldCheck aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span>The Park · Guía privada</span>
            </div>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/25 text-xs font-medium text-zinc-300 hover:text-white transition-all cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Volver a Inicio</span>
            </Link>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">
            Guía de registro de derechos musicales
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-300 sm:text-base">
            Sigue estos pasos para organizar los registros de una obra y su grabación. Los requisitos
            dependen de tu titularidad, elegibilidad y país.
          </p>
        </header>

        <section aria-labelledby="song-checklists-title" className="mb-12">
          <h2 id="song-checklists-title" className="text-2xl font-semibold">Checklist por tema</h2>
          <p className="mt-3 text-sm leading-7 text-zinc-300">
            Añade el nombre de tu música y marca los registros que ya completaste. Cada tema tiene sus propias marcas.
            La lista se guarda solo en este navegador; no se sincroniza con otros dispositivos.
          </p>
          <form className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(event) => {
            event.preventDefault();
            const name = newName.trim();
            if (!ready || !name) return;
            saveSongs([...songs, { id: crypto.randomUUID(), name, progress: { ...EMPTY_PROGRESS } }]);
            setNewName("");
          }}>
            <label className="min-w-0 flex-1 text-sm text-zinc-300">
              Nombre del tema
              <input required maxLength={200} value={newName} disabled={!ready}
                onChange={(event) => setNewName(event.target.value)} placeholder="Escribe el nombre de tu canción"
                className="mt-2 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-3 text-base text-white placeholder:text-zinc-500 focus:border-cyan-300 focus:outline-none" />
            </label>
            <button type="submit" disabled={!ready || !newName.trim()}
              className="min-h-12 rounded-lg bg-cyan-300 px-5 py-3 text-sm font-semibold text-black disabled:opacity-40">
              Añadir tema
            </button>
          </form>
          <p role="status" className="mt-3 text-sm leading-6 text-zinc-400">
            {storageMessage || (ready ? `${songs.length} temas en tu lista.` : "Cargando checklist guardado…")}
          </p>
          {unsaved && (
            <button type="button" onClick={() => saveSongs(songs)}
              className="mt-2 min-h-11 text-sm font-semibold text-cyan-300 underline underline-offset-4">Reintentar guardado</button>
          )}
          {ready && songs.length === 0 && (
            <p className="mt-5 rounded-lg border border-dashed border-white/15 p-5 text-sm text-zinc-400">
              Todavía no tienes temas en tu checklist. Añade el primero para llevar el control de sus registros.
            </p>
          )}
          <ul aria-label="Checklist de mis temas" className="mt-5 space-y-4">
            {songs.map((song) => (
              <li key={song.id} className="rounded-xl border border-white/10 bg-white/[0.025] p-4 sm:p-5">
                <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
                  <div className="w-full min-w-0 flex-1 sm:w-auto">
                    <h3 className="break-words text-lg font-semibold [overflow-wrap:anywhere]">{song.name}</h3>
                    <p className="mt-1 text-xs text-zinc-400">
                      {Object.values(song.progress).filter(Boolean).length} de {STEPS.length} registros marcados
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-x-4">
                    <button type="button" aria-label={`Editar nombre de ${song.name}`} onClick={() => {
                      setEditingId(song.id);
                      setEditingName(song.name);
                    }} className="min-h-11 text-sm text-cyan-300 underline underline-offset-4">Editar nombre</button>
                    <button type="button" aria-label={`Eliminar checklist de ${song.name}`} onClick={() => removeSong(song)}
                      className="min-h-11 text-sm text-zinc-400 underline underline-offset-4 hover:text-red-300">Eliminar</button>
                  </div>
                </div>
                {editingId === song.id && (
                  <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={(event) => {
                    event.preventDefault();
                    const name = editingName.trim();
                    if (!name) return;
                    saveSongs(songs.map((current) => current.id === song.id ? { ...current, name } : current));
                    setEditingId(null);
                  }}>
                    <label className="min-w-0 w-full text-sm text-zinc-300">
                      Nuevo nombre del tema
                      <input required maxLength={200} value={editingName} onChange={(event) => setEditingName(event.target.value)}
                        className="mt-2 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-3 text-base text-white focus:border-cyan-300 focus:outline-none" />
                    </label>
                    <button type="submit" disabled={!editingName.trim()}
                      className="min-h-11 rounded-lg bg-cyan-300 px-4 text-sm font-semibold text-black disabled:opacity-40">Guardar nombre</button>
                    <button type="button" onClick={() => setEditingId(null)} className="min-h-11 px-2 text-sm text-zinc-300">Cancelar</button>
                  </form>
                )}
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {STEPS.map((step) => (
                    <label key={step.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-300">
                      <input type="checkbox" checked={song.progress[step.id]} disabled={!ready}
                        onChange={() => toggleStep(song.id, step.id)}
                        aria-label={`${step.title} para ${song.name}`} className="peer sr-only" />
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-zinc-500 text-transparent transition peer-checked:border-cyan-300 peer-checked:bg-cyan-300 peer-checked:text-black peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-cyan-300">
                        <Check aria-hidden="true" className="h-3.5 w-3.5" />
                      </span>
                      {step.title}
                    </label>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <h2 className="mb-6 border-t border-white/10 pt-8 text-2xl font-semibold">Guía de registros</h2>
        <ol className="divide-y divide-white/10">
          {STEPS.map((step) => {
            return (
              <li key={step.id} className="py-7 first:pt-0 last:pb-0 sm:py-9">
                <div className="flex gap-4 sm:gap-6">
                  <span className="pt-1 font-mono text-sm text-cyan-300">{step.number}</span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xl font-semibold leading-snug sm:text-2xl">{step.title}</h3>
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
