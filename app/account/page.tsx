import React from "react";
import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrentUser, signOutAdmin } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/Button";
import { formatCurrency } from "@/lib/utils";
import { extractLicenseMetadata } from "@/lib/commerce/contracts";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login?redirect=/account");
  }

  const supabase = createAdminClient();

  // Find customer profile by email
  const { data: customer } = await supabase
    .from("customers")
    .select("id, name, email, created_at")
    .eq("email", user.email!)
    .maybeSingle();

  // Fetch purchases and entitlements for this user/email
  let purchases: any[] = [];
  if (customer?.id) {
    const { data: customerPurchases } = await supabase
      .from("purchases")
      .select(`
        id,
        license_tier,
        status,
        created_at,
        beats (
          id,
          title,
          slug,
          cover_path,
          bpm,
          musical_key
        ),
        license_types (
          name
        )
      `)
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false });

    purchases = customerPurchases || [];
  }

  const displayName = customer?.name || user.user_metadata?.full_name || user.email?.split("@")[0] || "Artista";
  const hasPurchases = purchases.length > 0;

  return (
    <div className="min-h-screen bg-[#08080a] text-white pt-28 pb-20 px-4 sm:px-6 lg:px-8 selection:bg-purple-500/30 selection:text-white">
      <div className="max-w-5xl mx-auto space-y-10">
        {/* Top Header Card */}
        <div className="p-6 sm:p-8 rounded-2xl bg-[#0e0e14] border border-white/[0.08] shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] font-mono tracking-[0.2em] text-purple-400 uppercase font-bold">
                PORTAL DE ARTISTA // RGODBEAT
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white uppercase font-sans">
              Bienvenido, {displayName}
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 font-mono">
              Cuenta: <span className="text-zinc-200">{user.email}</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/beats"
              className="px-4 py-2.5 rounded-lg text-xs font-mono font-bold tracking-wider uppercase bg-purple-600 hover:bg-purple-500 text-white transition-colors"
            >
              EXPLORAR BEATS →
            </Link>
            <form action={signOutAdmin}>
              <button
                type="submit"
                className="px-3.5 py-2.5 rounded-lg text-xs font-mono font-bold tracking-wider uppercase bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer"
              >
                CERRAR SESIÓN
              </button>
            </form>
          </div>
        </div>

        {/* Studio Pass / App VIP Banner */}
        <div className="p-6 rounded-2xl bg-gradient-to-r from-purple-950/40 via-[#0e0e14] to-[#0e0e14] border border-purple-500/20 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-1.5 max-w-xl">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-mono font-bold uppercase">
                STUDIO PASS
              </span>
              <span className="text-xs font-mono text-zinc-400">Acceso a App de Grabación Móvil</span>
            </div>
            <h2 className="text-lg font-bold text-white font-sans">
              Graba tus voces directamente desde tu teléfono celular
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Cada compra de beat en RGODBEAT desbloquea 30 días de acceso a nuestra App Móvil para grabar maquetas y temas con tus audífonos sin necesidad de PC.
            </p>
          </div>

          <div className="shrink-0 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-center">
            <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block">
              ESTADO DEL PASE
            </span>
            <span className={`text-sm font-mono font-bold ${hasPurchases ? "text-emerald-400" : "text-amber-400"}`}>
              {hasPurchases ? "ACTIVO (30 DÍAS)" : "DISPONIBLE CON TU PRIMER BEAT"}
            </span>
          </div>
        </div>

        {/* Purchases Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <div>
              <h2 className="text-lg font-extrabold tracking-tight text-white uppercase font-sans">
                Tus Beats y Licencias Compradas
              </h2>
              <p className="text-xs text-zinc-400">
                Archivos master de alta fidelidad, stems y contratos oficiales descargables en cualquier momento.
              </p>
            </div>
            <span className="text-xs font-mono px-2.5 py-1 rounded-md bg-white/[0.04] text-zinc-300 border border-white/[0.08]">
              {purchases.length} {purchases.length === 1 ? "BEAT" : "BEATS"}
            </span>
          </div>

          {hasPurchases ? (
            <div className="grid grid-cols-1 gap-4">
              {purchases.map((purchase) => {
                const beat = purchase.beats;
                const licenseName = purchase.license_types?.name || purchase.license_tier?.toUpperCase() || "LICENCIA";
                const isWavEligible = ["wav", "stems", "unlimited", "exclusive"].includes(purchase.license_tier);

                return (
                  <div
                    key={purchase.id}
                    className="p-5 rounded-xl bg-[#0e0e14] border border-white/[0.06] hover:border-white/10 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-4">
                      {/* Cover Preview */}
                      <div className="w-16 h-16 rounded-lg bg-zinc-900 border border-white/10 overflow-hidden shrink-0 relative flex items-center justify-center">
                        {beat?.cover_path ? (
                          <img
                            src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/rgodbeat-public/${beat.cover_path}`}
                            alt={beat.title || "Beat Cover"}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-xl">🎵</span>
                        )}
                      </div>

                      {/* Info */}
                      <div className="space-y-1">
                        <Link
                          href={`/beats/${beat?.slug || ""}`}
                          className="font-bold text-white text-base hover:text-purple-300 transition-colors uppercase tracking-tight"
                        >
                          {beat?.title || "Beat"}
                        </Link>
                        <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
                          <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-bold uppercase">
                            {licenseName}
                          </span>
                          <span className="text-[10px] font-mono text-zinc-400">
                            {extractLicenseMetadata(purchase).licenseId}
                          </span>
                          {beat?.bpm && <span>• {beat.bpm} BPM</span>}
                          {beat?.musical_key && <span>• {beat.musical_key}</span>}
                        </div>
                      </div>
                    </div>

                    {/* Action Download Buttons */}
                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                      {/* View Official License Ticket */}
                      <Link
                        href={`/tickets/${purchase.id}`}
                        className="flex-1 sm:flex-none px-3.5 py-2 rounded-lg text-xs font-mono font-bold tracking-wider uppercase bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 transition-colors text-center flex items-center justify-center gap-1.5"
                      >
                        <span>🎫</span>
                        <span>TICKET OFICIAL</span>
                      </Link>

                      {/* Download Master Audio */}
                      <a
                        href={`/api/download/${purchase.id}?fileType=${isWavEligible ? "wav" : "mp3"}`}
                        className="flex-1 sm:flex-none px-3.5 py-2 rounded-lg text-xs font-mono font-bold tracking-wider uppercase bg-white/[0.06] hover:bg-white/10 border border-white/10 text-white transition-colors text-center"
                      >
                        DESCARGAR {isWavEligible ? "WAV MASTER" : "MP3"}
                      </a>

                      {/* Download Contract License */}
                      <a
                        href={`/api/download/${purchase.id}?fileType=contract`}
                        className="flex-1 sm:flex-none px-3.5 py-2 rounded-lg text-xs font-mono font-bold tracking-wider uppercase bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/30 text-purple-200 transition-colors text-center"
                      >
                        CONTRATO PDF
                      </a>

                      {/* Grouped Stems Access Upon Request (Unlimited & Exclusive) */}
                      {(purchase.license_tier === "unlimited" || purchase.license_tier === "exclusive") && (
                        <a
                          href={`mailto:rgodbeat@gmail.com?subject=Solicitud de Stems Agrupados - Beat: ${encodeURIComponent(beat?.title || "Beat")} (Orden ${purchase.id.slice(0, 8)})`}
                          className="flex-1 sm:flex-none px-3.5 py-2 rounded-lg text-xs font-mono font-bold tracking-wider uppercase bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 text-purple-300 transition-colors text-center"
                          title="Acceso a stems agrupados bajo solicitud para licencias Unlimited y Exclusive"
                        >
                          SOLICITAR STEMS
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Empty State */
            <div className="p-12 rounded-2xl bg-[#0e0e14]/50 border border-white/[0.06] text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-2xl">
                🎧
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white uppercase">Aún no tienes beats comprados</h3>
                <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                  Explora nuestro catálogo Top 23. Cuando adquieras un beat, tus descargas y licencias aparecerán aquí automáticamente.
                </p>
              </div>
              <div className="pt-2">
                <Button href="/beats" variant="primary" size="md">
                  VER TOP 23 BEATS →
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
